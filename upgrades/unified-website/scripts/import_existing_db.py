"""Optional offline, additive migration from CYBER SURAKSHA 2.0's existing SQLite database.
Never modifies the source or exposes private rows via public routes.
Creates a backup of the destination before merging into its own tables.
"""
from pathlib import Path
from datetime import datetime,timezone
import argparse,sqlite3,sys
from contextlib import closing
ROOT=Path(__file__).resolve().parent.parent
DEST=ROOT/'instance/cyber_suraksha.db'
TABLES={
 'incidents':'reference',
 'soc_alerts':'alert_id',
 'disclosure_reports':'report_ref',
 'zero_trust_evaluations':None,
 'stage3_audit':None}

def ask_file():
    try:
        import tkinter as tk
        from tkinter import filedialog
        root=tk.Tk();root.withdraw();root.update()
        chosen=filedialog.askopenfilename(title='Select your existing CYBER SURAKSHA 2.0 cyber_suraksha.db',filetypes=[('SQLite file','*.db'),('All files','*.*')])
        root.destroy()
        if chosen:return Path(chosen)
    except Exception:pass
    entered=input('Existing cyber_suraksha.db full file path (or Enter to cancel): ').strip(' "')
    return Path(entered) if entered else None

def columns(db,table):return [x[1] for x in db.execute('PRAGMA table_info("'+table+'")').fetchall()]

def import_db(source,dest=DEST):
    source=Path(source).expanduser().resolve();dest=Path(dest).expanduser().resolve()
    if not source.is_file() or source.name!='cyber_suraksha.db':raise ValueError('Choose a valid existing cyber_suraksha.db')
    if source==dest:raise ValueError('Source and destination must be different files')
    dest.parent.mkdir(parents=True,exist_ok=True)
    if not dest.exists():
        # Add the known schema before merging. Disable public sharing of this file.
        sys.path.insert(0,str(ROOT))
        import app
        if dest!=app.DB_FILE:raise ValueError('Destination override needs an initialized schema for testing.')
        app.initialize_database()
    counts={}
    backup=None
    with closing(sqlite3.connect(f'file:{source.as_posix()}?mode=ro',uri=True)) as old:
        old.row_factory=sqlite3.Row
        existing={r[0] for r in old.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if 'incidents' not in existing:raise ValueError('Not a recognized CYBER SURAKSHA database (incidents table missing).')
        with closing(sqlite3.connect(dest)) as new:
            if not new.execute("SELECT name FROM sqlite_master WHERE name='incidents'").fetchone():raise ValueError('Destination schema not initialized.')
            stamp=datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
            backup=dest.with_name('cyber_suraksha_before_import_'+stamp+'.db.bak')
            with closing(sqlite3.connect(backup)) as b:new.backup(b)
            # Import everything transactionally. Do not copy SQLite ROWIDs.
            try:
                new.execute('BEGIN')
                for table,key in TABLES.items():
                    if table not in existing or not columns(new,table):continue
                    new_cols=columns(new,table)
                    imported=0
                    for row in old.execute('SELECT * FROM "'+table+'"'):
                        fields=[c for c in row.keys() if c in new_cols and c!='id']
                        if not fields:continue
                        if key:
                            if key not in fields:continue
                            if new.execute(f'SELECT 1 FROM "{table}" WHERE "{key}"=?',(row[key],)).fetchone():
                                # Respect existing rows. Do not overwrite local modifications.
                                continue
                        elif table=='zero_trust_evaluations':
                            if new.execute('SELECT 1 FROM zero_trust_evaluations WHERE scenario_id=? AND decision=? AND created_at=?',(row['scenario_id'],row['decision'],row['created_at'])).fetchone():continue
                        elif table=='stage3_audit':
                            if new.execute('SELECT 1 FROM stage3_audit WHERE event_time=? AND action=? AND detail=?',(row['event_time'],row['action'],row['detail'])).fetchone():continue
                        sql='INSERT INTO "'+table+'" ('+','.join('"'+c+'"' for c in fields)+') VALUES ('+','.join('?'*len(fields))+')'
                        new.execute(sql,[row[c] for c in fields]);imported+=1
                    counts[table]=imported
                new.commit()
            except Exception:
                new.rollback()
                raise
    return backup,counts

if __name__=='__main__':
    parser=argparse.ArgumentParser(description='Optional additive import from your old project database')
    parser.add_argument('--source',type=Path,default=None)
    args=parser.parse_args()
    old=args.source or ask_file()
    if old is None:sys.exit('Import cancelled. No data changed.')
    print('Stop both websites during import. Your old database will not be edited.')
    try:
        backup,counts=import_db(old)
        print('Import completed. Existing unified database backup:',backup)
        for k,v in counts.items():print(f'  {k}: {v} new rows added')
        print('Real or sensitive records must not be published; public routes still show synthetic training data only.')
    except Exception as error:sys.exit('No successful import: '+str(error))

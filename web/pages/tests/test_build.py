"""Build checks focus on deployable paths, CSP origins and translation integrity."""
import importlib.util
import json
from pathlib import Path
import re
import unittest
import tempfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('export_site', ROOT / 'scripts/export_site.py')
export = importlib.util.module_from_spec(spec)
spec.loader.exec_module(export)

class StaticBuild(unittest.TestCase):
    def test_api_config_is_https_without_credentials_or_unbounded_origins(self):
        self.assertEqual(export.api_configuration('https://api.example/path/'), ('https://api.example/path', "'self' https://api.example"))
        self.assertEqual(export.api_configuration(''), ('', "'self'"))
        for value in ('http://api.example', 'https://name:key@api.example', 'https://api.example/#fragment', 'https://api.example/?key=x', 'https://api.example:bad', 'https://api.example/ newline\n'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                export.api_configuration(value)

    def test_translations_cover_the_same_nonempty_labels_and_client_errors(self):
        dictionaries = [json.loads((ROOT / f'source/data/ui_{lang}.json').read_text()) for lang in ('en', 'hi', 'te')]
        keys = set(dictionaries[0])
        for copy in dictionaries:
            self.assertEqual(set(copy), keys)
            self.assertTrue(all(isinstance(value, str) and value.strip() for value in copy.values()))
        code = (ROOT / 'source/static/js/account.js').read_text()
        error_keys = set(re.findall(r"(?:new ApiError|message)\('([a-z_]+)'", code))
        error_keys.discard('account_request_cancelled')
        self.assertFalse(error_keys - keys)

    def test_templates_never_render_account_state_inline(self):
        for path in (ROOT / 'source/templates').glob('*.html'):
            text = path.read_text()
            self.assertNotRegex(text, r'<script(?![^>]*\bsrc=)[^>]*>')
            self.assertNotIn('|safe', text)
            self.assertNotRegex(text, r'\bon(?:click|submit|error|load)\s*=')

    def test_copy_bindings_do_not_overwrite_dynamic_form_values(self):
        template = '<label>{{ t(\'name\') }}</label><input placeholder="{{ t(\'name\') }}"><textarea>{{ t(\'name\') }}</textarea>'
        result = export.bind_copy(template)
        self.assertIn('data-copy-key="name"', result)
        self.assertIn('data-copy-placeholder="name"', result)
        self.assertNotIn('<textarea><span', result)

    def test_isolated_preview_does_not_change_production_configuration(self):
        original = (ROOT / 'source/site.json').read_bytes()
        settings = json.loads(original)
        settings.update(base_path='/cyber-suraksha-2.0/google-test', api_url='https://stage.example', test_workspace=True)
        with tempfile.TemporaryDirectory() as directory:
            temporary = Path(directory)
            config = temporary / 'site.json'
            config.write_text(json.dumps(settings))
            output = temporary / 'compiled'
            export.main(['--config', str(config), '--output', str(output)])
            self.assertEqual(len(list(output.rglob('*.html'))), 16)
            self.assertTrue((output / 'en/operator.html').is_file())
            self.assertTrue((output / 'hi/operator.html').is_file())
            self.assertTrue((output / 'te/operator.html').is_file())
            account = (output / 'en/account.html').read_text()
            public = (output / 'en/index.html').read_text()
            self.assertIn('data-api-url="https://stage.example"', account)
            self.assertIn('Staging workspace', account)
            self.assertIn('For testing only.', account)
            self.assertIn('/cyber-suraksha-2.0/google-test/en/privacy.html', account)
            self.assertIn('https://accounts.google.com/gsi/client', account)
            self.assertNotIn('https://accounts.google.com', public)
            self.assertIn('content="strict-origin-when-cross-origin"', account)
            self.assertIn('content="no-referrer"', public)
        self.assertEqual((ROOT / 'source/site.json').read_bytes(), original)

    def test_unified_staging_operator_links_and_compact_notice(self):
        config = ROOT / 'config/google-test.json'
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'review'
            export.main(['--config', str(config), '--output', str(output)])
            for language in ('en', 'hi', 'te'):
                account = (output / language / 'account.html').read_text()
                operator = (output / language / 'operator.html').read_text()
                expected = '/cyber-suraksha-2.0/google-test/' + language + '/operator.html'
                self.assertIn('data-operator-url="' + expected + '"', account)
                self.assertIn('href="' + expected + '"', account)
                self.assertIn('data-operator-panel="activity"', operator)
                self.assertIn('data-operator-panel="users"', operator)
                self.assertIn('data-operator-panel="sessions"', operator)
                self.assertIn('data-operator-panel="audit"', operator)
                self.assertIn('data-operator-panel="cases"', operator)
                self.assertNotIn('Temporary test workspace', account)
                self.assertNotIn('Temporary test workspace', operator)
                self.assertIn('fictional', (output / 'en/account.html').read_text().lower())
            script = (output / 'static/js/operator.js').read_text()
            self.assertNotIn('localStorage', script.replace('// No browser persistence, cookies, analytics or token logs.', ''))
            self.assertIn('Asia/Kolkata', script)
            self.assertIn('textContent', script)

    def test_unconfigured_google_never_adds_identity_provider_or_inline_style_permissions(self):
        settings = json.loads((ROOT / 'source/site.json').read_text())
        settings['google_client_id'] = ''
        with tempfile.TemporaryDirectory() as directory:
            temporary = Path(directory)
            config = temporary / 'site.json'
            config.write_text(json.dumps(settings))
            output = temporary / 'compiled'
            export.main(['--config', str(config), '--output', str(output)])
            for language in ('en', 'hi', 'te'):
                account = (output / language / 'account.html').read_text()
                self.assertNotIn('accounts.google.com', account)
                self.assertNotIn('style-src-attr', account)
                self.assertNotIn('style-src-elem', account)
                self.assertNotIn('Temporary test workspace', account)
                self.assertFalse((output / language / 'operator.html').exists())

    def test_build_refuses_to_replace_source_or_unrelated_output(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'keep'
            output.mkdir()
            marker = output / 'keep.txt'
            marker.write_text('preserve me')
            with self.assertRaises(ValueError):
                export.main(['--output', str(output)])
            self.assertEqual(marker.read_text(), 'preserve me')
        for output in (ROOT, ROOT / 'source', ROOT / 'source/data', ROOT.parent):
            with self.subTest(output=output), self.assertRaises(ValueError):
                export.main(['--output', str(output)])

if __name__ == '__main__':
    unittest.main()

# Known limitations and open risks

**Priority before wider external review:** complete browser QA and owner verification on a real Windows machine. Keep previous version and SQLite backup until satisfied. Do not import real victim records into internet-facing copies.

**Priority before public hosting:** secure infrastructure and monitoring, operational policies, verified domain and operator contacts, legal privacy review and data protection boundaries. This release is an independent informational/read-only service, not a case intake service. The included Render YAML is a starting configuration, not a high-availability production platform.

**Priority before government production:** a department sponsor, written authorization, contract/procurement eligibility, GIGW 3.0 and relevant STQC/NIC/CERT-In-related security requirements, privacy and accessibility assessments, and formal independent security clearances.

**International:** Each government sets requirements for security authorization, procurement, data sovereignty, language, accessibility and agency integrations. The FBI's idea-submission process permits review but does not imply acceptance.

**Assistant quality:** It is a narrow deterministic guide; it cannot answer arbitrary questions with ChatGPT quality, verify authenticity of payments, automatically block crimes or guarantee detection. All incoming scam text is a client-side educational heuristic without server storage.

**Data import:** Merge inserts new unique records and backs up the destination; the source remains intact. Existing records with the same identifiers are deliberately not overwritten. Non-demo rows are not displayed through the public website, even if imported. A separate migration design is needed for full-scale sensitive/production data.

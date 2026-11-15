# Accessibility and inclusive design

[Repository](README.md) · [Documentation center](docs/README.md) · [Testing](docs/TESTING.md)

**CYBER SURAKSHA 2.0** is an independent, multilingual digital-safety initiative. This statement concerns the public awareness experience and the separate owner pilot; it does not imply a formal accessibility certification.

## Commitment

Accessibility is a continuing design and test requirement. The public site includes English, Hindi and Telugu content, and the interfaces should remain understandable across desktop and mobile devices. **No independent WCAG 2.2 conformance audit has been established** for either live service.

## Priorities

| Area | Expected practice | How to verify |
| --- | --- | --- |
| Keyboard use | Reach links, menus, forms and dialogs without a mouse | Tab / Shift+Tab / Enter / Esc manual checks |
| Screen readers | Semantic headings, accessible labels and meaningful controls | Screen-reader walkthrough |
| Visual design | Readable text, adequate contrast, focus indicators and responsive layout | Browser zoom and contrast checks |
| Language | Correct language labels and translations for English, Hindi and Telugu | Native-language and assistive-technology review |
| Error handling | Plain-language errors tied to relevant inputs | Invalid-input and form-review scenarios |
| Motion / controls | Avoid essential content conveyed only through animation or color | Reduced-motion and non-color checks |
| Owner authentication | Accessible OTP and MFA input flows without lowering security | Owner test session with synthetic records |

## Source locations

- [Public English website](deploy/cyber-suraksha-independent/site/en/index.html)
- [Public site CSS](deploy/cyber-suraksha-independent/site/app.css)
- [Portal templates](deploy/citizen-owner-portal/templates/portal/)
- [Portal CSS](deploy/citizen-owner-portal/static/css/site.css)
- [Quality and release criteria](docs/RELEASE_READINESS.md)

## Known limits and reporting

An accessible design intention is not equivalent to passing formal tests. Record any tested browser, OS, accessibility tool, language, software version, observed issue and reproduction steps. For non-sensitive issues, use the repository's issue tracker. Do not include private account details, screenshots with personal data or secrets.

[Contribute an improvement](CONTRIBUTING.md) · [Security reporting](SECURITY.md)

**Status:** Accessibility work remains open to verification; no government or institutional accessibility endorsement is claimed.

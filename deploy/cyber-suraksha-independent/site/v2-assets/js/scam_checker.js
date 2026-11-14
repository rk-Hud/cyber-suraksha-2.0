/* CYBER SURAKSHA 2.0 — independently directed and owned by Jatoth Ramakrishna.
 * All analysis is local. No URL is opened, expanded, uploaded or persisted.
 * A reference-domain match and a heuristic score cannot certify safety.
 */
(function (root) {
  'use strict';

  const LIMIT = 2000;
  const REFERENCE_UPDATED = '2026-11-13';
  const SHORTENERS = new Set([
    'bit.ly', 'tinyurl.com', 't.co', 'is.gd', 'cutt.ly', 'rb.gy', 'shorturl.at',
    'rebrand.ly', 't.jio', 't.jio.com', 'goo.gl', 'buff.ly', 'ow.ly', 'tiny.one'
  ]);
  const RULES = Object.freeze({
    credential_request: 34, secrets_present: 36, urgency: 18, reward: 18,
    upfront_fee: 28, remote_access: 30, receive_pin: 35, authority_threat: 32,
    challan_host: 70, government_suffix: 38, brand_lookalike: 70,
    brand_spelling: 28, brand_unverified: 38, punycode: 20, ip_host: 26,
    userinfo: 35, shortener: 18, insecure_transport: 28, encoded_link: 12,
    hidden_characters: 12, redirect_parameter: 20, malformed_address: 24
  });

  // Reference domains identify a namespace only. They are not a safe-URL database.
  const KNOWN_DOMAINS = Object.freeze([
    { name: 'Amazon', keys: ['amazon'], domains: ['amazon.in', 'amazon.com', 'amazon.co.uk', 'amazon.de', 'amazon.fr', 'amazon.it', 'amazon.es', 'amazon.ca', 'amazon.com.au', 'amazon.co.jp', 'amazon.com.br', 'amazon.com.mx', 'amazon.nl', 'amazon.se', 'amazon.pl', 'amazon.sg', 'amazon.com.tr', 'amazon.ae', 'amazon.sa', 'amazon.eg', 'amazon.co.za', 'amazon.ie', 'amazon.com.be'] },
    { name: 'Google', keys: ['google'], domains: ['google.com', 'google.co.in', 'google.co.uk', 'google.de', 'google.fr', 'google.co.jp', 'google.com.au', 'google.ca', 'google.es', 'google.it', 'gmail.com'] },
    { name: 'Microsoft', keys: ['microsoft', 'outlook'], domains: ['microsoft.com', 'microsoftonline.com', 'live.com', 'outlook.com', 'office.com'] },
    { name: 'Apple', keys: ['apple'], domains: ['apple.com', 'icloud.com'] },
    { name: 'PayPal', keys: ['paypal'], domains: ['paypal.com', 'paypal.me'] },
    { name: 'WhatsApp', keys: ['whatsapp'], domains: ['whatsapp.com', 'wa.me'] },
    { name: 'Facebook', keys: ['facebook'], domains: ['facebook.com', 'fb.com'] },
    { name: 'Instagram', keys: ['instagram'], domains: ['instagram.com'] },
    { name: 'Flipkart', keys: ['flipkart'], domains: ['flipkart.com'] },
    { name: 'State Bank of India', keys: ['sbi', 'onlinesbi'], domains: ['sbi.co.in', 'onlinesbi.sbi', 'onlinesbi.com'] },
    { name: 'Parivahan', keys: [], domains: ['parivahan.gov.in'] },
    { name: 'National Cyber Crime Reporting Portal', keys: [], domains: ['cybercrime.gov.in'] },
    { name: 'Sanchar Saathi', keys: [], domains: ['sancharsaathi.gov.in', 'dot.gov.in'] },
    { name: 'UIDAI', keys: [], domains: ['uidai.gov.in'] },
    { name: 'CERT-In', keys: [], domains: ['cert-in.org.in'] }
  ].map(entry => Object.freeze({ name: entry.name, keys: Object.freeze(entry.keys), domains: Object.freeze(entry.domains) })));

  const COPY = {
  "en": {
    "empty": "Enter a message or URL first. Do not include passwords, OTPs or account details.",
    "tooLong": "Keep the input to 2,000 characters or fewer.",
    "invalid": "The input could not be checked. Use plain text within the character limit.",
    "characters": "characters",
    "high": "Several strong warning signs",
    "elevated": "Warning signs need attention",
    "few": "Limited warning signs detected",
    "none": "No configured rule matched",
    "score": "Risk indicator",
    "meaning": "This adds the displayed local warning weights, capped at 100. It is not a measured probability, an accuracy percentage or a live reputation verdict.",
    "caution": "No score can certify safety. A recognised domain does not verify a page, sender or request; unknown domains are not automatically fraudulent. Use a separately opened official channel for important decisions.",
    "noMatches": "No local warning rule matched. This does not establish that the message is genuine or that a destination is safe.",
    "next": "If money has been lost in India, contact your bank and call 1930 promptly. Use the official reporting guide below.",
    "rules": {
      "link": [
        "Contains a web address",
        "A link is present. Its presence alone does not establish fraud. Do not open an unexpected link just to test it."
      ],
      "credential_request": [
        "Requests a secret or verification code",
        "The text combines a request with an OTP, password, PIN, CVV or verification code. Never disclose those secrets to a caller or message sender."
      ],
      "secrets_present": [
        "May contain a verification code",
        "The text appears to include an OTP or verification code. Clear it from this field; use fictional or redacted text when checking messages."
      ],
      "urgency": [
        "Pressures you to act quickly",
        "Urgency, short deadlines or a suspension threat can discourage independent checks. Pause and contact the service through a known channel."
      ],
      "reward": [
        "Mentions a reward or refund",
        "Cashback, winnings, a prize or a refund can be used as a lure. Confirm eligibility with the service directly."
      ],
      "upfront_fee": [
        "Payment requested to obtain a benefit",
        "The text connects a job, prize, refund or KYC request with a fee or deposit. Verify the request independently before paying."
      ],
      "remote_access": [
        "Mentions remote access software",
        "Remote access tools can give another person control of your device. Do not install or grant access at an unsolicited caller’s request."
      ],
      "receive_pin": [
        "Links receiving money with a PIN",
        "Receiving a UPI payment does not require you to enter your UPI PIN. A PIN authorises an outgoing payment or another protected action."
      ],
      "authority_threat": [
        "Uses an arrest or authority threat",
        "Claims of a digital arrest or threats tied to police, court or customs need independent verification. Do not transfer money to satisfy a caller’s demand."
      ],
      "challan_host": [
        "E-challan branding on a different host",
        "The address uses e-challan or Parivahan wording outside the parivahan.gov.in domain. The national e-challan service is echallan.parivahan.gov.in. This is a strong impersonation signal, not a live reputation check."
      ],
      "government_suffix": [
        "Government name appears inside a different domain",
        "The address contains gov.in or nic.in wording but does not end at that domain boundary. An official-looking name inside another hostname does not confer government ownership."
      ],
      "punycode": [
        "Internationalised hostname",
        "The hostname uses the xn-- representation. Internationalised domains can be legitimate, but similar-looking letters can imitate a familiar address."
      ],
      "ip_host": [
        "Uses a numeric network address",
        "The link points to an IP address rather than a named service. This is unusual for a public payment or identity-verification request."
      ],
      "userinfo": [
        "Contains an address before the real hostname",
        "The URL contains a username or password component before an @ sign. The text before @ is not the destination hostname."
      ],
      "shortener": [
        "Uses a link shortener",
        "A shortened URL conceals the destination. This tool does not follow or expand links. Verify through a known official address."
      ],
      "insecure_transport": [
        "Uses an HTTP link",
        "HTTP does not provide encrypted transport. HTTPS also does not establish that the site is trustworthy."
      ],
      "encoded_link": [
        "Contains an encoded or disguised link",
        "The text uses URL encoding or hxxp notation that obscures an address. The checker only decodes text locally; it never opens the destination."
      ],
      "hidden_characters": [
        "Contains invisible formatting characters",
        "Invisible characters can disguise words or addresses. They may also occur in ordinary writing, so review the surrounding request carefully."
      ],
      "brand_lookalike": [
        "Hostname visually imitates a familiar name",
        "The hostname uses a character substitution or confusable spelling that resembles a configured brand outside that brand’s domain. This is a strong lookalike signal, not proof of a live malicious site."
      ],
      "brand_spelling": [
        "Hostname spelling is close to a familiar name",
        "A bounded spelling check found a small change from a configured name. It may be unrelated or legitimate; compare the complete hostname through an independent official source."
      ],
      "brand_unverified": [
        "Brand wording is placed inside a different destination",
        "A configured domain appears before another hostname suffix, in URL user information, or beside account/login wording outside the configured brand domain. The real destination needs independent verification."
      ],
      "redirect_parameter": [
        "Contains another destination in a redirect parameter",
        "The URL includes a different address in a redirect, continue or destination parameter. Recognising the outer hostname does not verify the final destination."
      ],
      "malformed_address": [
        "An address could not be parsed",
        "At least one address-like string is malformed. Do not repair and open an unexpected address just to test it; verify it through a known channel."
      ]
    },
    "examples": {
      "challan": "Pay your pending e-challan immediately: https://echallan-parivahan.xyz",
      "cashback": "Congratulations! Claim your cashback now. Enter your UPI PIN to receive money at https://reward-check.example",
      "job": "You are selected for a remote job. Pay the registration fee today to receive the offer.",
      "ordinary": "Your library book is due on Friday. Please return it at the desk."
    },
    "addressTitle": "Hostname review",
    "httpWarning": "HTTP warning: this address does not use encrypted HTTPS transport. Do not enter passwords, OTPs or payment details on it.",
    "referenceNote": "Domain recognition uses a finite, maintained reference list. This check does not contact a reputation database, resolve redirects or examine website contents.",
    "verdicts": {
      "known_domain": "Recognised domain — content not verified",
      "suspicious": "Warning signs found — verify before acting",
      "high_risk": "Strong warning signs — treat as high risk",
      "unverified": "Unverified — authenticity is not established",
      "no_signs": "No local warning signs — authenticity is not established"
    },
    "addressLabels": {
      "known_domain": "recognised reference domain",
      "lookalike": "familiar-name lookalike",
      "similar_spelling": "similar spelling",
      "brand_unverified": "misleading brand placement",
      "shortened": "concealed destination",
      "unverified": "not verified",
      "ip": "numeric destination"
    },
    "addressReasons": {
      "known_domain": "Matches a configured domain for {brand}. This says nothing about the safety of its page contents or a message that links to it.",
      "lookalike": "Resembles {brand}, but is outside its configured domain boundaries. Similar-looking characters or substitutions can disguise a different destination.",
      "similar_spelling": "The spelling is close to {brand}. Similar names can also be unrelated; confirm the exact address independently.",
      "brand_unverified": "A familiar domain or account-related brand name is embedded in another destination. Verify who controls the real hostname.",
      "shortened": "The final destination is concealed. This tool neither follows this link nor confirms the sender or destination.",
      "unverified": "This hostname is outside the finite reference catalogue. Its owner, current reputation and contents have not been checked.",
      "ip": "The destination is a numeric IP address rather than an identified public service."
    }
  },
  "hi": {
    "empty": "पहले संदेश या URL दर्ज करें। पासवर्ड, ओटीपी या खाते का विवरण शामिल न करें।",
    "tooLong": "इनपुट 2,000 अक्षरों या उससे कम रखें।",
    "invalid": "इनपुट की जाँच नहीं हो सकी। अक्षर सीमा के भीतर साधारण पाठ का उपयोग करें।",
    "characters": "अक्षर",
    "high": "कई गंभीर चेतावनी संकेत",
    "elevated": "चेतावनी संकेतों पर ध्यान दें",
    "few": "कुछ चेतावनी संकेत मिले",
    "none": "निर्धारित नियमों में कोई मेल नहीं",
    "score": "जोखिम संकेतक",
    "meaning": "दिखाए गए स्थानीय चेतावनी अंकों को अधिकतम 100 तक जोड़ा जाता है। यह मापी गई संभावना, सटीकता का प्रतिशत या लाइव प्रतिष्ठा जाँच का निर्णय नहीं है।",
    "caution": "कोई स्कोर सुरक्षा प्रमाणित नहीं कर सकता। पहचाना गया डोमेन पृष्ठ, भेजने वाले या माँग की पुष्टि नहीं करता; अनजान डोमेन अपने आप धोखाधड़ी नहीं होते। महत्वपूर्ण निर्णय के लिए आधिकारिक माध्यम अलग से खोलें।",
    "noMatches": "कोई स्थानीय चेतावनी नियम नहीं मिला। इससे संदेश का असली होना या गंतव्य की सुरक्षा सिद्ध नहीं होती।",
    "next": "भारत में पैसे खो गए हों तो तुरंत अपने बैंक से संपर्क करें और 1930 पर कॉल करें। नीचे आधिकारिक रिपोर्टिंग मार्गदर्शिका देखें।",
    "rules": {
      "link": [
        "वेब पता शामिल है",
        "संदेश में लिंक है। केवल लिंक होने से धोखाधड़ी सिद्ध नहीं होती। अनचाहा लिंक जाँचने के लिए न खोलें।"
      ],
      "credential_request": [
        "गोपनीय जानकारी या सत्यापन कोड की माँग",
        "पाठ में ओटीपी, पासवर्ड, पिन, सीवीवी या सत्यापन कोड माँगने का संकेत है। कॉल या संदेश भेजने वाले को ये गोपनीय विवरण कभी न दें।"
      ],
      "secrets_present": [
        "सत्यापन कोड शामिल हो सकता है",
        "पाठ में ओटीपी या सत्यापन कोड दिखाई देता है। इसे इस फ़ील्ड से मिटाएँ; संदेश की जाँच के लिए काल्पनिक या छिपाए गए विवरण उपयोग करें।"
      ],
      "urgency": [
        "जल्दी कार्रवाई का दबाव",
        "तत्काल कार्रवाई, कम समयसीमा या खाता बंद करने की धमकी स्वतंत्र जाँच रोक सकती है। रुकें और परिचित माध्यम से सेवा से संपर्क करें।"
      ],
      "reward": [
        "इनाम या रिफंड का उल्लेख",
        "कैशबैक, जीत, पुरस्कार या रिफंड को प्रलोभन बनाया जा सकता है। सीधे संबंधित सेवा से पात्रता की पुष्टि करें।"
      ],
      "upfront_fee": [
        "लाभ पाने के लिए भुगतान की माँग",
        "पाठ नौकरी, पुरस्कार, रिफंड या केवाईसी के साथ शुल्क या जमा राशि जोड़ता है। भुगतान से पहले स्वतंत्र रूप से पुष्टि करें।"
      ],
      "remote_access": [
        "रिमोट एक्सेस सॉफ़्टवेयर का उल्लेख",
        "रिमोट एक्सेस सॉफ़्टवेयर से दूसरे व्यक्ति को आपके उपकरण का नियंत्रण मिल सकता है। अनचाहे कॉल पर इसे स्थापित न करें और अनुमति न दें।"
      ],
      "receive_pin": [
        "पैसे प्राप्त करने के लिए पिन का उल्लेख",
        "यूपीआई भुगतान प्राप्त करने के लिए यूपीआई पिन दर्ज नहीं करना पड़ता। पिन से बाहर जाने वाला भुगतान या अन्य सुरक्षित कार्रवाई अधिकृत होती है।"
      ],
      "authority_threat": [
        "गिरफ़्तारी या अधिकारी की धमकी",
        "डिजिटल अरेस्ट के दावे या पुलिस, अदालत अथवा सीमा शुल्क की धमकियों की स्वतंत्र पुष्टि करें। कॉल करने वाले की माँग पर पैसे न भेजें।"
      ],
      "challan_host": [
        "अलग होस्ट पर ई-चालान का नाम",
        "पता parivahan.gov.in डोमेन के बाहर ई-चालान या परिवहन का नाम उपयोग करता है। राष्ट्रीय ई-चालान सेवा echallan.parivahan.gov.in है। यह प्रतिरूपण का गंभीर संकेत है, लाइव प्रतिष्ठा जाँच नहीं।"
      ],
      "government_suffix": [
        "अलग डोमेन के भीतर सरकारी नाम",
        "पते में gov.in या nic.in लिखा है, लेकिन होस्ट उस डोमेन सीमा पर समाप्त नहीं होता। दूसरे होस्टनाम में सरकारी नाम लिखने से सरकारी स्वामित्व नहीं मिलता।"
      ],
      "punycode": [
        "अंतरराष्ट्रीयकृत होस्टनाम",
        "होस्टनाम में xn-- रूप है। ऐसे डोमेन वैध हो सकते हैं, लेकिन मिलते-जुलते अक्षरों से परिचित पते की नकल भी की जा सकती है।"
      ],
      "ip_host": [
        "संख्यात्मक नेटवर्क पता",
        "लिंक किसी सेवा के नाम के बजाय IP पते पर जाता है। सार्वजनिक भुगतान या पहचान सत्यापन की माँग में यह असामान्य है।"
      ],
      "userinfo": [
        "वास्तविक होस्टनाम से पहले पता",
        "URL में @ से पहले उपयोगकर्ता नाम या पासवर्ड का भाग है। @ से पहले लिखा पाठ गंतव्य होस्टनाम नहीं है।"
      ],
      "shortener": [
        "छोटे लिंक की सेवा",
        "छोटा URL वास्तविक गंतव्य छिपाता है। यह उपकरण लिंक खोलता या विस्तारित नहीं करता। परिचित आधिकारिक पते से पुष्टि करें।"
      ],
      "insecure_transport": [
        "HTTP लिंक",
        "HTTP एन्क्रिप्टेड संचार नहीं देता। HTTPS होने से भी साइट की विश्वसनीयता सिद्ध नहीं होती।"
      ],
      "encoded_link": [
        "एन्कोड किया गया या छिपाया गया लिंक",
        "पाठ में URL एन्कोडिंग या hxxp लिखावट से पता छिपाया गया है। जाँच केवल उपकरण पर पाठ खोलती है; गंतव्य नहीं खोलती।"
      ],
      "hidden_characters": [
        "अदृश्य स्वरूपण अक्षर",
        "अदृश्य अक्षर शब्द या पते छिपा सकते हैं। ये सामान्य लेखन में भी आ सकते हैं; आसपास की माँग को ध्यान से देखें।"
      ],
      "brand_lookalike": [
        "होस्टनाम परिचित नाम की नकल करता है",
        "होस्टनाम निर्धारित ब्रांड जैसा दिखने के लिए अलग अक्षर या मिलती-जुलती लिखावट उपयोग करता है और उस ब्रांड के डोमेन से बाहर है। यह नकल का गंभीर संकेत है; लाइव दुर्भावनापूर्ण साइट का प्रमाण नहीं।"
      ],
      "brand_spelling": [
        "होस्टनाम की वर्तनी परिचित नाम के पास है",
        "सीमित वर्तनी जाँच में निर्धारित नाम से छोटा बदलाव मिला। यह असंबंधित या वैध भी हो सकता है; आधिकारिक स्रोत से पूरा होस्टनाम मिलाएँ।"
      ],
      "brand_unverified": [
        "ब्रांड का नाम दूसरे गंतव्य में रखा गया है",
        "निर्धारित डोमेन दूसरे होस्टनाम प्रत्यय से पहले, URL के उपयोगकर्ता भाग में, या निर्धारित ब्रांड डोमेन से बाहर खाता/लॉगिन शब्दों के साथ है। वास्तविक गंतव्य की स्वतंत्र पुष्टि करें।"
      ],
      "redirect_parameter": [
        "रीडायरेक्ट पैरामीटर में दूसरा गंतव्य है",
        "URL में रीडायरेक्ट, जारी रखने या गंतव्य के पैरामीटर में दूसरा पता है। बाहर का होस्टनाम पहचानने से अंतिम गंतव्य की पुष्टि नहीं होती।"
      ],
      "malformed_address": [
        "पता समझा नहीं जा सका",
        "कम से कम एक पते जैसा पाठ सही रूप में नहीं है। अनचाहा पता सुधारकर जाँचने के लिए न खोलें; परिचित माध्यम से उसकी पुष्टि करें।"
      ]
    },
    "examples": {
      "challan": "अपना लंबित ई-चालान तुरंत भरें: https://echallan-parivahan.xyz",
      "cashback": "बधाई! अपना कैशबैक अभी पाएँ। पैसे प्राप्त करने के लिए अपना यूपीआई पिन दर्ज करें: https://reward-check.example",
      "job": "आप नौकरी के लिए चुने गए हैं। प्रस्ताव पाने के लिए आज ही पंजीकरण शुल्क जमा करें।",
      "ordinary": "आपकी पुस्तक शुक्रवार तक लौटानी है। कृपया इसे पुस्तकालय के काउंटर पर लौटा दें।"
    },
    "addressTitle": "होस्टनाम की समीक्षा",
    "httpWarning": "HTTP चेतावनी: यह पता एन्क्रिप्टेड HTTPS संचार उपयोग नहीं करता। इस पर पासवर्ड, ओटीपी या भुगतान विवरण दर्ज न करें।",
    "referenceNote": "डोमेन की पहचान एक सीमित, रखरखाव की जाने वाली संदर्भ सूची से होती है। यह जाँच प्रतिष्ठा डेटाबेस से संपर्क, रीडायरेक्ट खोलना या वेबसाइट की सामग्री देखना नहीं करती।",
    "verdicts": {
      "known_domain": "डोमेन पहचाना गया — सामग्री की पुष्टि नहीं हुई",
      "suspicious": "चेतावनी संकेत मिले — कार्रवाई से पहले पुष्टि करें",
      "high_risk": "गंभीर चेतावनी संकेत — अधिक जोखिम समझें",
      "unverified": "अपुष्ट — प्रामाणिकता स्थापित नहीं है",
      "no_signs": "स्थानीय चेतावनी नहीं — प्रामाणिकता स्थापित नहीं है"
    },
    "addressLabels": {
      "known_domain": "संदर्भ सूची में पहचाना गया डोमेन",
      "lookalike": "परिचित नाम जैसा दिखने वाला पता",
      "similar_spelling": "मिलती-जुलती वर्तनी",
      "brand_unverified": "भ्रामक स्थान पर ब्रांड का नाम",
      "shortened": "गंतव्य छिपा हुआ है",
      "unverified": "पुष्टि नहीं हुई",
      "ip": "संख्यात्मक गंतव्य"
    },
    "addressReasons": {
      "known_domain": "यह {brand} के निर्धारित डोमेन से मेल खाता है। इससे उस पृष्ठ की सामग्री या उससे जुड़े संदेश की सुरक्षा सिद्ध नहीं होती।",
      "lookalike": "यह {brand} जैसा दिखता है, लेकिन उसके निर्धारित डोमेन की सीमा के बाहर है। एक जैसे दिखने वाले अक्षर या बदलाव अलग गंतव्य छिपा सकते हैं।",
      "similar_spelling": "इसकी वर्तनी {brand} के पास है। समान नाम असंबंधित भी हो सकते हैं; पूरा पता स्वतंत्र रूप से जाँचें।",
      "brand_unverified": "परिचित डोमेन या खाते से जुड़ा ब्रांड नाम दूसरे गंतव्य में रखा गया है। वास्तविक होस्टनाम के नियंत्रक की पुष्टि करें।",
      "shortened": "अंतिम गंतव्य छिपा हुआ है। यह उपकरण लिंक नहीं खोलता और भेजने वाले या गंतव्य की पुष्टि नहीं करता।",
      "unverified": "यह होस्टनाम सीमित संदर्भ सूची में नहीं है। उसके मालिक, वर्तमान प्रतिष्ठा और सामग्री की जाँच नहीं हुई है।",
      "ip": "गंतव्य किसी पहचानी गई सार्वजनिक सेवा के नाम के बजाय संख्यात्मक IP पता है।"
    }
  },
  "te": {
    "empty": "ముందుగా సందేశం లేదా URL నమోదు చేయండి. పాస్‌వర్డ్‌లు, ఓటీపీలు లేదా ఖాతా వివరాలు చేర్చవద్దు.",
    "tooLong": "ఇన్‌పుట్‌ను 2,000 అక్షరాలు లేదా అంతకంటే తక్కువగా ఉంచండి.",
    "invalid": "ఇన్‌పుట్‌ను తనిఖీ చేయలేకపోయాం. అక్షరాల పరిమితిలో సాధారణ పాఠ్యాన్ని ఉపయోగించండి.",
    "characters": "అక్షరాలు",
    "high": "అనేక బలమైన హెచ్చరిక సంకేతాలు",
    "elevated": "హెచ్చరిక సంకేతాలను గమనించండి",
    "few": "కొన్ని హెచ్చరిక సంకేతాలు గుర్తించబడ్డాయి",
    "none": "నిర్దేశించిన నియమాలు ఏవీ సరిపోలలేదు",
    "score": "ప్రమాద సూచిక",
    "meaning": "చూపిన స్థానిక హెచ్చరిక అంకెలను గరిష్ఠంగా 100 వరకు కలుపుతాం. ఇది కొలిచిన సంభావ్యత, ఖచ్చితత్వ శాతం లేదా ప్రత్యక్ష ప్రతిష్ఠ తనిఖీ తీర్పు కాదు.",
    "caution": "ఏ స్కోరు భద్రతను ధృవీకరించదు. గుర్తించిన డొమైన్ పేజీ, పంపినవారు లేదా అభ్యర్థనను నిర్ధారించదు; తెలియని డొమైన్‌లు స్వయంగా మోసపూరితమైనవి కావు. ముఖ్యమైన నిర్ణయాలకు అధికారిక మార్గాన్ని విడిగా తెరవండి.",
    "noMatches": "స్థానిక హెచ్చరిక నియమం ఏదీ సరిపోలలేదు. దీనివల్ల సందేశం నిజమైనదని లేదా గమ్యస్థానం సురక్షితమని నిర్ధారణ కాదు.",
    "next": "భారతదేశంలో డబ్బు పోయినట్లయితే వెంటనే మీ బ్యాంకును సంప్రదించి 1930కు కాల్ చేయండి. కింద ఉన్న అధికారిక ఫిర్యాదు మార్గదర్శిని చూడండి.",
    "rules": {
      "link": [
        "వెబ్ చిరునామా ఉంది",
        "సందేశంలో లింక్ ఉంది. లింక్ ఉండటం ఒక్కటే మోసానికి రుజువు కాదు. పరీక్షించేందుకు అనుకోని లింక్‌ను తెరవవద్దు."
      ],
      "credential_request": [
        "రహస్య సమాచారం లేదా ధృవీకరణ కోడ్ అభ్యర్థన",
        "ఓటీపీ, పాస్‌వర్డ్, పిన్, సీవీవీ లేదా ధృవీకరణ కోడ్ కోరే అభ్యర్థన కనిపిస్తోంది. కాల్ చేసినవారికి లేదా సందేశం పంపినవారికి ఈ రహస్యాలను ఇవ్వవద్దు."
      ],
      "secrets_present": [
        "ధృవీకరణ కోడ్ ఉండవచ్చు",
        "పాఠ్యంలో ఓటీపీ లేదా ధృవీకరణ కోడ్ కనిపిస్తోంది. దాన్ని ఈ గడి నుంచి తొలగించండి; సందేశం తనిఖీకి కల్పిత లేదా దాచిన వివరాలు ఉపయోగించండి."
      ],
      "urgency": [
        "వెంటనే చర్య తీసుకోవాలనే ఒత్తిడి",
        "అత్యవసరత, తక్కువ గడువు లేదా ఖాతాను నిలిపివేస్తామనే బెదిరింపు స్వతంత్ర తనిఖీని అడ్డుకోవచ్చు. ఆగి, తెలిసిన మార్గంలో సేవను సంప్రదించండి."
      ],
      "reward": [
        "బహుమతి లేదా రీఫండ్ ప్రస్తావన",
        "క్యాష్‌బ్యాక్, గెలుపు, బహుమతి లేదా రీఫండ్‌ను ఎరగా వాడవచ్చు. అర్హతను నేరుగా సంబంధిత సేవతో నిర్ధారించండి."
      ],
      "upfront_fee": [
        "ప్రయోజనం పొందేందుకు ముందస్తు చెల్లింపు",
        "ఉద్యోగం, బహుమతి, రీఫండ్ లేదా కేవైసీ కోసం రుసుము లేదా డిపాజిట్ కోరుతోంది. చెల్లించే ముందు స్వతంత్రంగా ధృవీకరించండి."
      ],
      "remote_access": [
        "రిమోట్ యాక్సెస్ సాఫ్ట్‌వేర్ ప్రస్తావన",
        "రిమోట్ యాక్సెస్ సాధనాలు మీ పరికర నియంత్రణను మరొకరికి ఇవ్వవచ్చు. అనుకోని కాల్ చేసినవారి అభ్యర్థనపై వాటిని ఇన్‌స్టాల్ చేయవద్దు; అనుమతి ఇవ్వవద్దు."
      ],
      "receive_pin": [
        "డబ్బు అందుకోవడానికి పిన్ ప్రస్తావన",
        "యూపీఐ చెల్లింపును అందుకోవడానికి మీ యూపీఐ పిన్ అవసరం లేదు. పిన్ డబ్బు పంపే చెల్లింపును లేదా మరొక రక్షిత చర్యను అనుమతిస్తుంది."
      ],
      "authority_threat": [
        "అరెస్టు లేదా అధికారుల పేరుతో బెదిరింపు",
        "డిజిటల్ అరెస్టు వాదనలు, పోలీసు, న్యాయస్థానం లేదా కస్టమ్స్ బెదిరింపులను స్వతంత్రంగా ధృవీకరించండి. కాల్ చేసినవారి డిమాండ్ మేరకు డబ్బు పంపవద్దు."
      ],
      "challan_host": [
        "వేరే హోస్ట్‌లో ఈ-చలాన్ పేరు",
        "చిరునామా parivahan.gov.in డొమైన్‌కు బయట ఈ-చలాన్ లేదా పరివాహన్ పేరును వాడుతోంది. జాతీయ ఈ-చలాన్ సేవ echallan.parivahan.gov.in. ఇది అనుకరణకు బలమైన సంకేతం; ప్రత్యక్ష ప్రతిష్ఠ తనిఖీ కాదు."
      ],
      "government_suffix": [
        "వేరే డొమైన్ లోపల ప్రభుత్వ పేరు",
        "చిరునామాలో gov.in లేదా nic.in ఉంది; కానీ హోస్ట్ ఆ డొమైన్ సరిహద్దు వద్ద ముగియదు. మరొక హోస్ట్ పేరులో ప్రభుత్వ పేరు ఉండటం ప్రభుత్వ యాజమాన్యాన్ని నిర్ధారించదు."
      ],
      "punycode": [
        "అంతర్జాతీయీకరించిన హోస్ట్ పేరు",
        "హోస్ట్ పేరులో xn-- రూపం ఉంది. ఇటువంటి డొమైన్‌లు చెల్లుబాటు కావచ్చు; ఒకేలా కనిపించే అక్షరాలతో తెలిసిన చిరునామాను అనుకరించవచ్చు."
      ],
      "ip_host": [
        "సంఖ్యలతో కూడిన నెట్‌వర్క్ చిరునామా",
        "లింక్ సేవ పేరు బదులుగా IP చిరునామాకు వెళ్తోంది. ప్రజా చెల్లింపు లేదా గుర్తింపు ధృవీకరణ అభ్యర్థనలో ఇది అసాధారణం."
      ],
      "userinfo": [
        "నిజమైన హోస్ట్ పేరుకు ముందు చిరునామా",
        "URLలో @ గుర్తుకు ముందు వినియోగదారు పేరు లేదా పాస్‌వర్డ్ భాగం ఉంది. @ ముందు ఉన్న పాఠ్యం గమ్యస్థాన హోస్ట్ పేరు కాదు."
      ],
      "shortener": [
        "కుదించిన లింక్",
        "కుదించిన URL అసలు గమ్యాన్ని దాచుతుంది. ఈ సాధనం లింక్‌ను తెరవదు లేదా విస్తరించదు. తెలిసిన అధికారిక చిరునామా ద్వారా ధృవీకరించండి."
      ],
      "insecure_transport": [
        "HTTP లింక్",
        "HTTP గుప్తీకరించిన ప్రసారాన్ని అందించదు. HTTPS ఉండటం కూడా సైట్ విశ్వసనీయతను నిర్ధారించదు."
      ],
      "encoded_link": [
        "ఎన్‌కోడ్ చేసిన లేదా దాచిన లింక్",
        "పాఠ్యం URL ఎన్‌కోడింగ్ లేదా hxxp రూపంలో చిరునామాను దాచుతోంది. తనిఖీ పాఠ్యాన్ని పరికరంలోనే డీకోడ్ చేస్తుంది; గమ్యస్థానాన్ని తెరవదు."
      ],
      "hidden_characters": [
        "కనిపించని ఫార్మాటింగ్ అక్షరాలు",
        "కనిపించని అక్షరాలు పదాలు లేదా చిరునామాలను దాచవచ్చు. సాధారణ రచనలోనూ ఇవి ఉండవచ్చు; చుట్టూ ఉన్న అభ్యర్థనను జాగ్రత్తగా పరిశీలించండి."
      ],
      "brand_lookalike": [
        "హోస్ట్ పేరు పరిచిత పేరును అనుకరిస్తోంది",
        "హోస్ట్ పేరు బ్రాండ్‌లాగా కనిపించేందుకు వేరే అక్షరాలు లేదా సారూప్య రూపం వాడుతోంది; ఆ బ్రాండ్ డొమైన్‌కు బయట ఉంది. ఇది అనుకరణకు బలమైన సంకేతం; ప్రత్యక్ష హానికర సైట్‌కు రుజువు కాదు."
      ],
      "brand_spelling": [
        "హోస్ట్ పేరుకు పరిచిత పేరుతో దగ్గరి పోలిక",
        "పరిమిత పేరు తనిఖీలో పేర్కొన్న పేరుతో చిన్న మార్పు కనిపించింది. ఇది సంబంధం లేనిది లేదా చెల్లుబాటు అయ్యేదీ కావచ్చు; పూర్తి హోస్ట్‌ను అధికారిక మూలంతో పోల్చండి."
      ],
      "brand_unverified": [
        "బ్రాండ్ పేరును వేరే గమ్యస్థానంలో ఉంచారు",
        "పేర్కొన్న డొమైన్ మరొక హోస్ట్ చివరి భాగానికి ముందు, URL వినియోగదారు భాగంలో లేదా బ్రాండ్ డొమైన్‌కు బయట ఖాతా/లాగిన్ పదాలతో కనిపిస్తోంది. నిజమైన గమ్యస్థానాన్ని స్వతంత్రంగా నిర్ధారించండి."
      ],
      "redirect_parameter": [
        "దారిమళ్లింపు పరామితిలో మరొక గమ్యస్థానం",
        "URLలో దారిమళ్లింపు, కొనసాగింపు లేదా గమ్యస్థాన పరామితిలో వేరే చిరునామా ఉంది. బయట హోస్ట్‌ను గుర్తించడం చివరి గమ్యాన్ని నిర్ధారించదు."
      ],
      "malformed_address": [
        "చిరునామాను అర్థం చేసుకోలేకపోయాం",
        "కనీసం ఒక చిరునామా వంటి పాఠ్యం సరైన రూపంలో లేదు. పరీక్షించేందుకు అనుకోని చిరునామాను సరిచేసి తెరవవద్దు; తెలిసిన మార్గంలో నిర్ధారించండి."
      ]
    },
    "examples": {
      "challan": "పెండింగ్ ఈ-చలాన్‌ను వెంటనే చెల్లించండి: https://echallan-parivahan.xyz",
      "cashback": "అభినందనలు! మీ క్యాష్‌బ్యాక్‌ను ఇప్పుడే పొందండి. డబ్బు అందుకోవడానికి మీ యూపీఐ పిన్ నమోదు చేయండి: https://reward-check.example",
      "job": "మీరు ఉద్యోగానికి ఎంపికయ్యారు. ఆఫర్ పొందేందుకు ఈరోజే నమోదు రుసుము చెల్లించండి.",
      "ordinary": "మీ గ్రంథాలయ పుస్తకాన్ని శుక్రవారంలోపు తిరిగి ఇవ్వాలి. దయచేసి కౌంటర్ వద్ద ఇవ్వండి."
    },
    "addressTitle": "హోస్ట్ పేరు సమీక్ష",
    "httpWarning": "HTTP హెచ్చరిక: ఈ చిరునామా గుప్తీకరించిన HTTPS ప్రసారాన్ని ఉపయోగించదు. ఇందులో పాస్‌వర్డ్‌లు, ఓటీపీలు లేదా చెల్లింపు వివరాలు నమోదు చేయవద్దు.",
    "referenceNote": "డొమైన్ గుర్తింపు పరిమితంగా నిర్వహించే సూచన జాబితాపై ఆధారపడుతుంది. ఈ తనిఖీ ప్రతిష్ఠ డేటాబేసును సంప్రదించదు, దారిమళ్లింపు లింకులను తెరవదు, వెబ్‌సైట్ విషయాలను పరిశీలించదు.",
    "verdicts": {
      "known_domain": "డొమైన్ గుర్తించబడింది — విషయాలు ధృవీకరించలేదు",
      "suspicious": "హెచ్చరిక సంకేతాలు ఉన్నాయి — చర్యకు ముందు ధృవీకరించండి",
      "high_risk": "బలమైన హెచ్చరికలు — అధిక ప్రమాదంగా పరిగణించండి",
      "unverified": "ధృవీకరించలేదు — ప్రామాణికత నిర్ధారణ కాలేదు",
      "no_signs": "స్థానిక హెచ్చరికలు లేవు — ప్రామాణికత నిర్ధారణ కాలేదు"
    },
    "addressLabels": {
      "known_domain": "సూచన జాబితాలో గుర్తించిన డొమైన్",
      "lookalike": "పరిచిత పేరు లాగా కనిపించే చిరునామా",
      "similar_spelling": "పేరులో సమీప పోలిక",
      "brand_unverified": "తప్పుదారి పట్టించే బ్రాండ్ స్థానం",
      "shortened": "గమ్యస్థానం దాచబడింది",
      "unverified": "ధృవీకరించలేదు",
      "ip": "సంఖ్యల గమ్యస్థానం"
    },
    "addressReasons": {
      "known_domain": "ఇది {brand} కోసం పేర్కొన్న డొమైన్‌కు సరిపోతుంది. పేజీ విషయాలు లేదా దానికి లింక్ ఇచ్చిన సందేశం సురక్షితమని దీనివల్ల నిర్ధారణ కాదు.",
      "lookalike": "ఇది {brand} లాగా కనిపిస్తుంది; కానీ దాని డొమైన్ సరిహద్దుకు బయట ఉంది. ఒకేలా కనిపించే అక్షరాలు లేదా మార్పులు వేరే గమ్యస్థానాన్ని దాచవచ్చు.",
      "similar_spelling": "ఈ పేరు {brand}కు దగ్గరగా ఉంది. పోలిన పేర్లు సంబంధం లేనివి కూడా కావచ్చు; పూర్తి చిరునామాను స్వతంత్రంగా నిర్ధారించండి.",
      "brand_unverified": "పరిచిత డొమైన్ లేదా ఖాతాకు సంబంధించిన బ్రాండ్ పేరును వేరే గమ్యస్థానంలో ఉంచారు. నిజమైన హోస్ట్‌ను ఎవరు నియంత్రిస్తున్నారో నిర్ధారించండి.",
      "shortened": "చివరి గమ్యస్థానం దాచబడింది. ఈ సాధనం లింక్ తెరవదు; పంపినవారిని లేదా గమ్యస్థానాన్ని నిర్ధారించదు.",
      "unverified": "ఈ హోస్ట్ పరిమిత సూచన జాబితాలో లేదు. దాని యజమాని, ప్రస్తుత ప్రతిష్ఠ లేదా విషయాలు తనిఖీ చేయలేదు.",
      "ip": "గమ్యస్థానం గుర్తించిన ప్రజా సేవ పేరు బదులుగా సంఖ్యల IP చిరునామా."
    }
  }
};

  function inputError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }

  function decodeLocally(text) {
    let value = text;
    for (let pass = 0; pass < 2; pass += 1) {
      try {
        const decoded = decodeURIComponent(value);
        if (decoded === value) break;
        value = decoded;
      } catch (_) {
        value = value.replace(/(?:%[a-f\d]{2})+/gi, part => {
          try { return decodeURIComponent(part); } catch (_) { return part; }
        });
        break;
      }
    }
    return value;
  }

  function parseAddresses(text) {
    const addresses = [];
    let invalidCount = 0;
    // The whole input is bounded. These are candidates only, never network targets.
    const pattern = /(?:https?:\/\/|hxxps?:\/\/|www\.)[^\s<>"']+|(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,62}[\p{L}\p{N}])?\.)+[\p{L}]{2,63}(?:[/:?#][^\s<>"']*)?/giu;
    for (const match of text.matchAll(pattern)) {
      let value = match[0];
      const explicit = /^(?:https?|hxxps?):\/\//i.test(value);
      // An email address is not a URL to the sender's domain.
      if (!explicit && match.index > 0 && /[\p{L}\p{N}@_.-]/u.test(text[match.index - 1])) continue;
      value = value.replace(/[,;!?\)}।]+$/u, '').replace(/^hxxp/i, 'http');
      // Keep IPv6 host brackets; trim only an extra prose/markup closing bracket.
      let excessBrackets = (value.match(/\]/g) || []).length - (value.match(/\[/g) || []).length;
      while (excessBrackets > 0 && value.endsWith(']')) { value = value.slice(0, -1); excessBrackets -= 1; }
      try {
        const parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
        const plainHost = parsed.hostname.replace(/\.$/, '');
        if (!plainHost || plainHost.length > 253 || !plainHost.startsWith('[') && plainHost.split('.').some(label => !label)) { invalidCount += 1; continue; }
        addresses.push(parsed);
      } catch (_) {
        invalidCount += 1;
      }
    }
    return { addresses, invalidCount };
  }

  function isWithin(host, domain) {
    return host === domain || host.endsWith(`.${domain}`);
  }

  function knownReference(host) {
    return KNOWN_DOMAINS.find(entry => entry.domains.some(domain => isWithin(host, domain))) || null;
  }

  // RFC 3492 decoding is local and bounded to DNS-label size. URL has already
  // performed the browser's hostname validity and IDNA normalisation checks.
  function unicodeLabel(label) {
    if (!label.startsWith('xn--')) return label;
    const encoded = label.slice(4);
    const delimiter = encoded.lastIndexOf('-');
    const output = delimiter < 0 ? [] : Array.from(encoded.slice(0, delimiter), ch => ch.codePointAt(0));
    let cursor = delimiter < 0 ? 0 : delimiter + 1;
    let number = 128, index = 0, bias = 72;
    function adapt(delta, count, first) {
      delta = first ? Math.floor(delta / 700) : Math.floor(delta / 2);
      delta += Math.floor(delta / count);
      let shift = 0;
      while (delta > 455) { delta = Math.floor(delta / 35); shift += 36; }
      return shift + Math.floor(36 * delta / (delta + 38));
    }
    try {
      while (cursor < encoded.length) {
        const previous = index;
        let weight = 1;
        for (let step = 36; ; step += 36) {
          if (cursor >= encoded.length || step > 288) return label;
          const point = encoded.charCodeAt(cursor++);
          const digit = point >= 48 && point <= 57 ? point - 22 : point >= 97 && point <= 122 ? point - 97 : -1;
          if (digit < 0) return label;
          index += digit * weight;
          if (!Number.isSafeInteger(index)) return label;
          const threshold = step <= bias ? 1 : step >= bias + 26 ? 26 : step - bias;
          if (digit < threshold) break;
          weight *= 36 - threshold;
          if (!Number.isSafeInteger(weight)) return label;
        }
        const count = output.length + 1;
        bias = adapt(index - previous, count, previous === 0);
        number += Math.floor(index / count);
        index %= count;
        if (number > 0x10ffff || number >= 0xd800 && number <= 0xdfff || output.length >= 63) return label;
        output.splice(index++, 0, number);
      }
      return String.fromCodePoint(...output);
    } catch (_) { return label; }
  }

  const CONFUSABLES = Object.freeze({
    'а': 'a', 'с': 'c', 'е': 'e', 'і': 'i', 'ј': 'j', 'о': 'o', 'р': 'p',
    'ѕ': 's', 'у': 'y', 'х': 'x', 'ӏ': 'l', 'ԁ': 'd', 'ԛ': 'q', 'ԝ': 'w',
    'α': 'a', 'ϲ': 'c', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ο': 'o', 'ρ': 'p',
    'τ': 't', 'υ': 'u', 'χ': 'x', 'ν': 'v'
  });
  function visualSkeleton(value) {
    return Array.from(value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase(), ch => CONFUSABLES[ch] || ch)
      .join('').replace(/0/g, 'o').replace(/1/g, 'l').replace(/rn/g, 'm').replace(/vv/g, 'w');
  }

  function nearSpelling(left, right, limit) {
    if (Math.abs(left.length - right.length) > limit || left.length > 63) return false;
    const rows = Array.from({ length: left.length + 1 }, (_, i) => [i]);
    rows[0] = Array.from({ length: right.length + 1 }, (_, j) => j);
    for (let i = 1; i <= left.length; i += 1) {
      for (let j = 1; j <= right.length; j += 1) {
        const change = left[i - 1] === right[j - 1] ? 0 : 1;
        rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + change);
        if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
          rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
        }
      }
    }
    return rows[left.length][right.length] <= limit;
  }

  function embeddedDomain(host, domain) {
    let index = host.indexOf(domain + '.');
    while (index !== -1) {
      if (index === 0 || host[index - 1] === '.') return true;
      index = host.indexOf(domain + '.', index + 1);
    }
    return false;
  }

  function inspectHost(address, matched) {
    const host = address.hostname.toLowerCase().replace(/\.$/, '');
    const known = knownReference(host);
    const numeric = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || /^\[.*\]$/.test(host);
    const shortened = SHORTENERS.has(host);
    if (host.split('.').some(label => label.startsWith('xn--'))) matched.add('punycode');
    if (numeric) matched.add('ip_host');
    if (address.username || address.password) matched.add('userinfo');
    if (shortened) matched.add('shortener');
    if (address.protocol === 'http:') matched.add('insecure_transport');
    if (/(?:e[-_.]?challan|parivahan|echallan)/i.test(host) && !isWithin(host, 'parivahan.gov.in')) matched.add('challan_host');
    if (/(?:gov\.in|nic\.in)/i.test(host) && !isWithin(host, 'gov.in') && !isWithin(host, 'nic.in')) matched.add('government_suffix');
    for (const [key, value] of address.searchParams) {
      if (/^(?:url|u|redirect|redirect_uri|redirect_url|next|continue|return|returnto|return_url|target|dest|destination)$/i.test(key) && /^https?:\/\//i.test(decodeLocally(value))) {
        matched.add('redirect_parameter');
      }
    }
    if (known) return Object.freeze({ host, status: 'known_domain', knownBrand: known.name, transport: address.protocol.slice(0, -1) });
    if (numeric || shortened) return Object.freeze({ host, status: numeric ? 'ip' : 'shortened', knownBrand: null, transport: address.protocol.slice(0, -1) });

    const labels = host.split('.').slice(0, -1).map(unicodeLabel);
    const userInfo = decodeLocally(address.username + ':' + address.password).toLowerCase();
    let finding = null;
    function remember(status, brand, rule) {
      if (!finding || RULES[rule] > RULES[finding.rule]) finding = { status, knownBrand: brand, rule };
    }
    for (const entry of KNOWN_DOMAINS) {
      if (entry.domains.some(domain => embeddedDomain(host, domain) || userInfo.includes(domain))) {
        remember('brand_unverified', entry.name, 'brand_unverified');
      }
      for (const label of labels) {
        const plain = label.normalize('NFKC').toLowerCase();
        for (const key of entry.keys) {
          if (plain === key) continue; // Unlisted regional domains remain unknown, not automatically fraudulent.
          if (visualSkeleton(plain) === key) {
            remember('lookalike', entry.name, 'brand_lookalike');
          } else if (plain === key + '-login' || plain === key + '-secure' || plain === key + '-account' || plain === key + '-verify' || plain === 'login-' + key || plain === 'secure-' + key) {
            remember('brand_unverified', entry.name, 'brand_unverified');
          } else if (key.length >= 6 && /^[a-z]+$/.test(plain)) {
            const limit = key.length >= 8 && plain[0] === key[0] && plain.slice(-2) === key.slice(-2) ? 2 : 1;
            if (nearSpelling(plain, key, limit)) remember('similar_spelling', entry.name, 'brand_spelling');
          }
        }
      }
    }
    if (finding) {
      matched.add(finding.rule);
      return Object.freeze({ host, status: finding.status, knownBrand: finding.knownBrand, transport: address.protocol.slice(0, -1) });
    }
    return Object.freeze({ host, status: 'unverified', knownBrand: null, transport: address.protocol.slice(0, -1) });
  }

  function credentialRequest(text) {
    const secret = /\b(?:otp|one[\s-]?time password|password|pin|cvv|verification code)\b|ओटीपी|पासवर्ड|पिन|सीवीवी|ఓటీపీ|పాస్‌వర్డ్|పాస్వర్డ్|పిన్|సీవీవీ/iu;
    const request = /\b(?:share|send|provide|tell|reveal|enter|confirm|verify|submit|give)\b|साझा\s*कर|शेयर\s*कर|भेज|बताए|बताय|दर्ज|जमा\s*कर|दे\s*दें|పంపండి|పంపించ|చెప్పండి|నమోదు|పంచుకోండి|తెలియజేయండి|ఇవ్వండి/iu;
    const negative = /\b(?:never|do not|don't)\s+(?:ever\s+)?(?:share|send|provide|tell|reveal|enter|give)\b|(?:ओटीपी|पासवर्ड|पिन).{0,35}(?:न\s*करें|नहीं|मत|न\s*दें)|(?:ఓటీపీ|పిన్|పాస్‌వర్డ్|పాస్వర్డ్).{0,35}(?:వద్దు|వద్దని|ఇవ్వకండి)/iu;
    return text.split(/[.!?।\n;]/u).some(sentence => secret.test(sentence) && request.test(sentence) && !negative.test(sentence));
  }

  function analyze(input) {
    if (typeof input !== 'string') throw inputError('INVALID_INPUT');
    if (Array.from(input).length > LIMIT) throw inputError('INPUT_TOO_LONG');
    if (!input.trim()) throw inputError('EMPTY_INPUT');
    const matched = new Set();
    const normal = input.normalize('NFKC');
    const concealedLatin = /[a-z\d][\u200B-\u200D\u2060\uFEFF]+[a-z\d]/iu.test(normal);
    const concealedAddress = /(?:https?:\/\/|hxxps?:\/\/|www\.)[^\s<>"']*[\u200B-\u200D\u2060\uFEFF]/iu.test(normal);
    if (concealedLatin || concealedAddress || /[\u202A-\u202E\u2066-\u2069]/u.test(normal)) matched.add('hidden_characters');
    const visible = normal.replace(/[\u200B-\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/gu, '');
    const decoded = decodeLocally(visible);
    const parsed = parseAddresses(decoded);
    const addresses = parsed.addresses;
    if (parsed.invalidCount) matched.add('malformed_address');
    if (/(?:hxxps?:\/\/|https?%3a|%2f%2f|%252f)/i.test(visible)) matched.add('encoded_link');
    if (/\bhttp:\/\//i.test(decoded)) matched.add('insecure_transport');
    if (credentialRequest(decoded)) matched.add('credential_request');
    if (/(?:\botp\b|verification code|ओटीपी|सत्यापन कोड|ఓటీపీ|ధృవీకరణ కోడ్)[^\n\d]{0,20}\b\d{4,8}\b/iu.test(decoded)) matched.add('secrets_present');
    if (/\b(?:urgent|urgently|immediately|act now|last warning|account.{0,15}(?:blocked|suspended)|within\s+\d+\s*(?:minutes?|hours?))\b|तुरंत|तत्काल|अभी.{0,12}(?:करें|भरें)|खाता.{0,12}बंद|వెంటనే|తక్షణం|ఖాతా.{0,16}నిలిపి/iu.test(decoded)) matched.add('urgency');
    if (/\b(?:cashback|lottery|you(?:'ve| have)? won|winnings|prize|refund)\b|कैशबैक|इनाम|लॉटरी|पुरस्कार|रिफंड|క్యాష్‌బ్యాక్|లాటరీ|బహుమతి|రీఫండ్/iu.test(decoded)) matched.add('reward');
    if (/(?:\b(?:job|offer|prize|refund|kyc)\b|नौकरी|पुरस्कार|रिफंड|केवाईसी|ఉద్యోగం|బహుమతి|రీఫండ్|కేవైసీ)/iu.test(decoded) && /\b(?:registration fee|processing fee|deposit|pay.{0,18}fee)\b|पंजीकरण शुल्क|प्रोसेसिंग शुल्क|शुल्क.{0,18}(?:जमा|भर)|जमा राशि|నమోదు రుసుము|ప్రాసెసింగ్ రుసుము|డిపాజిట్/iu.test(decoded)) matched.add('upfront_fee');
    if (/\b(?:anydesk|teamviewer|screenconnect|remote access|screen[- ]?sharing)\b|रिमोट एक्सेस|स्क्रीन शेयर|రిమోట్ యాక్సెస్|స్క్రీన్ షేర్/iu.test(decoded)) matched.add('remote_access');
    if (/(?:\b(?:receive|refund|cashback|credit)\b|प्राप्त|पैसे पाने|रिफंड|అందుకోవ|పొంద|రీఫండ్)/iu.test(decoded) && /\b(?:upi\s*)?pin\b|यूपीआई\s*पिन|पिन|యూపీఐ\s*పిన్|పిన్/iu.test(decoded) && !/\b(?:never|do not|don't|not required|does not require)\b|ज़रूरत नहीं|आवश्यक नहीं|अवश्यक नहीं|అవసరం లేదు|వద్దు/iu.test(decoded)) matched.add('receive_pin');
    if (/\bdigital arrest\b|डिजिटल अरेस्ट|డిజిటల్ అరెస్టు/iu.test(decoded) || (/(?:\b(?:police|court|customs|cbi)\b|पुलिस|अदालत|सीमा शुल्क|పోలీసు|కోర్టు|కస్టమ్స్)/iu.test(decoded) && /\b(?:arrest|warrant|pay now)\b|गिरफ्तार|गिरफ़्तार|वारंट|అరెస్టు|వారెంట్/iu.test(decoded))) matched.add('authority_threat');

    const reviewed = addresses.map(address => inspectHost(address, matched));
    const unique = new Map();
    for (const finding of reviewed) unique.set(finding.host + ':' + finding.transport, finding);
    const domainFindings = Object.freeze(Array.from(unique.values()));
    const rules = Object.freeze(Array.from(matched, id => Object.freeze({ id, weight: RULES[id] })));
    const score = Math.min(100, rules.reduce((total, rule) => total + rule.weight, 0));
    const unresolved = parsed.invalidCount > 0 || domainFindings.some(item => item.status !== 'known_domain') || matched.has('redirect_parameter');
    let verdict;
    if (score >= 60) verdict = 'high_risk';
    else if (score >= 25) verdict = 'suspicious';
    else if (unresolved) verdict = 'unverified';
    else if (score > 0) verdict = 'suspicious';
    else verdict = addresses.length ? 'known_domain' : 'no_signs';
    return Object.freeze({
      score, level: score >= 60 ? 'high' : score >= 25 ? 'elevated' : score > 0 ? 'few' : 'none',
      verdict, rules, addressCount: addresses.length, domainFindings,
      liveReputationChecked: false, referenceUpdated: REFERENCE_UPDATED
    });
  }

  function mount() {
    const form = document.getElementById('checker-form');
    if (!form) return;
    const input = document.getElementById('checker-input');
    const count = document.getElementById('checker-count');
    const output = document.getElementById('checker-results');
    const clear = document.getElementById('checker-clear');
    const empty = document.getElementById('checker-empty');
    if (!input || !output) return;
    const language = document.documentElement.lang.split('-')[0];
    const copy = COPY[language] || COPY.en;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    form.setAttribute('autocomplete', 'off');

    function add(tag, text, target) {
      const node = document.createElement(tag);
      node.textContent = text;
      (target || output).append(node);
      return node;
    }
    function updateCount() {
      if (count) count.textContent = `${Array.from(input.value).length}/${LIMIT} ${copy.characters}`;
    }
    function reset() {
      input.value = '';
      input.removeAttribute('aria-invalid');
      output.replaceChildren();
      output.hidden = true;
      if (empty) empty.hidden = false;
      updateCount();
    }
    input.addEventListener('input', () => {
      input.removeAttribute('aria-invalid');
      output.replaceChildren();
      output.hidden = true;
      if (empty) empty.hidden = false;
      updateCount();
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      output.replaceChildren();
      output.hidden = false;
      if (empty) empty.hidden = true;
      try {
        const result = analyze(input.value);
        output.dataset.level = result.level;
        output.dataset.verdict = result.verdict;
        output.classList.remove('result-high', 'result-elevated', 'result-few', 'result-none');
        output.classList.add(`result-${result.level}`);
        add('h3', copy.verdicts[result.verdict]).className = 'checker-verdict';
        add('p', `${copy.score}: ${result.score}/100`).className = 'warning-score';
        add('p', copy.meaning);
        if (result.rules.some(rule => rule.id === 'insecure_transport')) {
          const warning = add('p', '');
          warning.className = 'checker-transport-warning';
          add('strong', copy.httpWarning, warning);
        }
        if (result.domainFindings.length) {
          add('h4', copy.addressTitle);
          const review = add('ul', '');
          review.className = 'checker-domain-review';
          for (const finding of result.domainFindings) {
            const item = add('li', '', review);
            add('strong', `${finding.host} — ${copy.addressLabels[finding.status]}`, item);
            add('p', copy.addressReasons[finding.status].replace('{brand}', finding.knownBrand || ''), item);
          }
        }
        if (result.rules.length) {
          const list = add('ul', '');
          for (const rule of result.rules) {
            const item = add('li', '', list);
            add('strong', `${copy.rules[rule.id][0]} (+${rule.weight})`, item);
            add('p', copy.rules[rule.id][1], item);
          }
        } else add('p', copy.noMatches);
        add('p', copy.referenceNote).className = 'note';
        add('p', copy.caution).className = 'note';
        add('p', copy.next);
      } catch (error) {
        input.setAttribute('aria-invalid', 'true');
        add('p', error.code === 'EMPTY_INPUT' ? copy.empty : error.code === 'INPUT_TOO_LONG' ? copy.tooLong : copy.invalid);
        input.focus();
      }
    });
    if (clear) clear.addEventListener('click', () => { reset(); input.focus(); });
    for (const button of document.querySelectorAll('[data-checker-example]')) {
      button.addEventListener('click', () => {
        reset();
        input.value = copy.examples[button.dataset.checkerExample] || '';
        updateCount();
        input.focus();
      });
    }
    root.addEventListener('pagehide', reset);
    updateCount();
  }

  const api = Object.freeze({ analyze, LIMIT, COPY, KNOWN_DOMAINS, REFERENCE_UPDATED });
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof document !== 'undefined') {
    root.CyberSurakshaChecker = api;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
    else mount();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

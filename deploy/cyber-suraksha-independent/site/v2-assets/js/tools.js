/* CYBER SURAKSHA 2.0 — independently authored and owned by Jatoth Ramakrishna.
 * Citizen guidance stays in page memory. No telemetry, network calls or browser storage. */
(function () {
  'use strict';

  const language = document.documentElement.lang.split('-')[0];
  const copy = {
    en: {
      planTitle: 'Your next steps',
      money: [
        'Contact your bank or payment provider immediately through its official app or a verified number. Ask its fraud team to secure the account and attempt a transaction recall; recovery is not guaranteed.',
        'For financial cyber fraud in India, call 1930 promptly and report at cybercrime.gov.in. Outside India, use your local police and national reporting service.',
        'Keep transaction references, dates, messages and screenshots for your bank and the reporting authority. Do not publish sensitive evidence or send more money to someone promising recovery.'
      ],
      credentials: [
        'From a device you trust, open the service yourself and change the affected password. If you reused that password, change it on other accounts too.',
        'Use the service’s security settings to end unfamiliar sessions and revoke suspicious app access. Check recovery addresses and phone numbers, then enable strong multifactor authentication.',
        'If an OTP, UPI PIN or banking credential was shared, contact the bank immediately through its official channel. Monitor transactions and report any loss promptly.'
      ],
      account: [
        'Open the provider’s official app or known website from a trusted device. If you cannot sign in, use its official account recovery process; avoid paid “account recovery” strangers.',
        'If you retain access, change the password, end unfamiliar sessions, revoke suspicious connected apps and inspect recovery details and MFA methods. Secure the recovery email account as well.',
        'Warn affected contacts through a separate trusted channel if the account has sent fraudulent messages. Preserve evidence and report impersonation or takeover through the provider’s official support.'
      ],
      malware: [
        'Disconnect the affected device from Wi-Fi, Ethernet and shared drives to limit spread. Use a different trusted device to secure important accounts and contact your bank if payments may be affected.',
        'Do not install a “cleaner” sent by a caller, pay a ransom or run unknown recovery tools. Record visible warnings without opening more files; seek qualified device or incident-response support.',
        'Preserve relevant evidence before resetting or wiping the device. Restore from a known clean backup only after the threat is removed and the system is rebuilt or verified clean; keep backups disconnected from an infected device.'
      ],
      message: [
        'Pause. Do not reply, open attachments, install an app, scan a payment code or share a password, OTP or PIN.',
        'Verify the claim independently. Open the organisation’s known official app or type its official website address yourself; do not use contact details supplied in the suspicious message.',
        'Use the platform’s report and block controls. Preserve relevant evidence if threats, fraud or account misuse occurred; use official reporting services when needed.'
      ],
      access: 'If an unfamiliar person has remote access to your device, disconnect its network connection. Use another trusted device to contact your bank and secure accounts. Seek qualified device support before reconnecting.',
      scope: 'This plan is general guidance. It does not file a complaint, contact a bank or guarantee recovery. No choice you make here is saved.',
      invalid: 'Choose one of the listed options to continue.',
      socTitle: 'Triage assessment',
      socInvestigate: 'Investigate and escalate: a defensible next step.',
      socClose: 'Closing this alert would leave a material question unanswered.',
      socBlock: 'Blocking the IP alone is not a complete response.',
      socReasons: [
        'Repeated failed sign-ins followed by a successful sign-in and a new MFA enrolment suggest possible account takeover. The sequence is suspicious; it does not prove compromise.',
        'Preserve the identity logs and timeline. Verify with the account owner through an established channel whether the sign-in and MFA change were authorised; review device, location and session context.',
        'Escalate according to the organisation’s incident procedure. If compromise is confirmed or policy requires immediate containment, coordinate session and token revocation, credential reset and removal of unauthorised MFA methods.'
      ],
      socLimit: 'Fictional learning exercise. An address can be shared or change, so IP blocking alone does not end an active session. These actions are not executed by this page.',
      quizProgress: 'Question {current} of {total}',
      quizChoose: 'Choose an answer before checking it.',
      quizCorrect: 'Correct.',
      quizWrong: 'Review this answer.',
      quizNext: 'Next question',
      quizFinish: 'See result',
      quizRestart: 'Try again',
      quizDone: 'You answered {score} of {total} questions correctly.',
      quizDoneNote: 'Keep practising: verify through an independent official channel, protect authentication secrets, and act quickly after a loss. Your answers are not saved.',
      quiz: [
        {
          question: 'A message says an unpaid e-challan must be paid immediately through echallan-parivahan.xyz. What should you do first?',
          options: ['Pay quickly to avoid the threatened penalty.', 'Open the official e-challan service independently and verify the notice.', 'Reply with your driving licence and bank details.'],
          answer: 1,
          explanation: 'A name containing “parivahan” does not make a domain official. Verify independently at echallan.parivahan.gov.in. Do not use the suspicious message’s link.'
        },
        {
          question: 'A caller says they need your UPI PIN to send you a refund. What is the safest response?',
          options: ['Share the PIN if they know your name.', 'Share only one digit at a time.', 'End the call and verify the refund through the official provider.'],
          answer: 2,
          explanation: 'A UPI PIN authorises an outgoing transaction; it is not needed to receive money. Do not reveal it or enter it at a caller’s request.'
        },
        {
          question: 'Money has just left your account after a scam. Which response is most useful?',
          options: ['Contact the bank immediately and use the official fraud reporting service.', 'Pay a social media “recovery expert” an advance fee.', 'Delete every message before asking for help.'],
          answer: 0,
          explanation: 'Promptly notify the bank and preserve evidence. For financial cyber fraud in India, call 1930 and report at cybercrime.gov.in. A report does not guarantee recovery.'
        },
        {
          question: 'An account shows unfamiliar sign-ins and a new MFA method you did not add. What should you do?',
          options: ['Assume MFA means the account is safe.', 'Secure the account through the official provider, revoke unfamiliar sessions and inspect recovery settings.', 'Send a stranger your password so they can recover it.'],
          answer: 1,
          explanation: 'An attacker can add their own MFA method. Use a trusted device and the official recovery process, remove unauthorised access and secure the recovery email too.'
        },
        {
          question: 'Files are unexpectedly encrypted and a ransom note appears. What is the safest first step?',
          options: ['Disconnect the affected device from networks and seek qualified help while preserving evidence.', 'Connect every backup drive to check which files still open.', 'Install the recovery program sent by the ransom sender.'],
          answer: 0,
          explanation: 'Isolation can limit spread to shared drives and backups. Do not connect clean backups to an infected system; preserve evidence and obtain qualified support before recovery.'
        }
      ],
      assistantTitle: 'Practical guidance',
      assistantNote: 'This is a local, topic-based guide. It does not understand free text, access accounts or contact emergency services.',
      assistant: {
        payment: ['To receive money, you do not need to share a UPI PIN or OTP. Review the payee and amount before authorising any payment.', 'If money was lost, contact the bank immediately through an official channel. In India, call 1930 and use cybercrime.gov.in. Preserve transaction references.'],
        otp: ['Never tell an OTP, password or PIN to a caller or in a chat. An incoming call displaying a familiar name or number does not prove identity.', 'If you shared a secret, secure the account from a trusted device, revoke unfamiliar sessions and contact the relevant provider. For banking details, call the bank immediately.'],
        device: ['Do not install remote access software or an APK sent by an unknown caller. Use official app stores and the organisation’s verified site.', 'If remote control is active, disconnect the device from the network. Use a different trusted device to secure accounts and contact your bank; seek qualified device support.'],
        report: ['For financial cyber fraud in India, call 1930 promptly and file a report through cybercrime.gov.in. For immediate physical danger, contact your local emergency service.', 'Keep relevant evidence privately. This independent website does not accept complaints or represent a government agency. International visitors should use the official directory to locate local guidance.']
      }
    },
    hi: {
      planTitle: 'आपके अगले कदम',
      money: [
        'अपने बैंक या भुगतान सेवा के आधिकारिक ऐप या सत्यापित नंबर से तुरंत संपर्क करें। धोखाधड़ी विभाग से खाता सुरक्षित करने और लेन-देन वापस मँगाने का प्रयास करने को कहें; पैसे वापस मिलने की गारंटी नहीं है।',
        'भारत में वित्तीय साइबर धोखाधड़ी के लिए तुरंत 1930 पर कॉल करें और cybercrime.gov.in पर शिकायत दर्ज करें। भारत के बाहर स्थानीय पुलिस और राष्ट्रीय शिकायत सेवा का उपयोग करें।',
        'बैंक और शिकायत प्राधिकरण के लिए लेन-देन संदर्भ, तारीखें, संदेश और स्क्रीनशॉट सुरक्षित रखें। संवेदनशील साक्ष्य सार्वजनिक न करें और पैसे वापस दिलाने का दावा करने वाले को और पैसे न दें।'
      ],
      credentials: [
        'किसी भरोसेमंद डिवाइस से सेवा को स्वयं खोलकर प्रभावित पासवर्ड बदलें। यही पासवर्ड दूसरे खातों पर इस्तेमाल किया है तो वहाँ भी बदलें।',
        'सेवा की सुरक्षा सेटिंग में अनजान सत्र समाप्त करें और संदिग्ध ऐप की पहुँच हटाएँ। रिकवरी ईमेल और फोन नंबर जाँचें, फिर मजबूत बहु-कारक प्रमाणीकरण चालू करें।',
        'यदि OTP, UPI PIN या बैंकिंग जानकारी साझा की है तो बैंक के आधिकारिक माध्यम से तुरंत संपर्क करें। लेन-देन पर नज़र रखें और नुकसान की तुरंत शिकायत करें।'
      ],
      account: [
        'भरोसेमंद डिवाइस से सेवा का आधिकारिक ऐप या ज्ञात वेबसाइट खोलें। लॉगिन नहीं हो रहा तो आधिकारिक खाता रिकवरी प्रक्रिया इस्तेमाल करें; पैसे लेकर खाता वापस दिलाने का दावा करने वाले अनजान लोगों से बचें।',
        'पहुँच बनी हुई है तो पासवर्ड बदलें, अनजान सत्र समाप्त करें, संदिग्ध ऐप की पहुँच हटाएँ और रिकवरी विवरण तथा MFA विधियाँ जाँचें। रिकवरी ईमेल खाता भी सुरक्षित करें।',
        'खाते से धोखाधड़ी वाले संदेश भेजे गए हों तो प्रभावित संपर्कों को अलग भरोसेमंद माध्यम से सचेत करें। साक्ष्य सुरक्षित रखें और सेवा की आधिकारिक सहायता से पहचान की नकल या खाते पर कब्ज़े की शिकायत करें।'
      ],
      malware: [
        'प्रभावित डिवाइस को वाई-फ़ाई, ईथरनेट और साझा ड्राइव से अलग करें ताकि संक्रमण फैलने की संभावना घटे। महत्वपूर्ण खाते सुरक्षित करने और भुगतान प्रभावित होने पर बैंक से संपर्क के लिए दूसरा भरोसेमंद डिवाइस इस्तेमाल करें।',
        'कॉलर का भेजा “क्लीनर” इंस्टॉल न करें, फिरौती न दें और अनजान रिकवरी टूल न चलाएँ। अधिक फ़ाइलें खोले बिना दिखाई देने वाली चेतावनियाँ दर्ज करें; योग्य तकनीकी या घटना प्रतिक्रिया सहायता लें।',
        'डिवाइस रीसेट करने या मिटाने से पहले संबंधित साक्ष्य सुरक्षित रखें। खतरा हटने और सिस्टम दोबारा तैयार होने या साफ़ होने की जाँच के बाद ही ज्ञात सुरक्षित बैकअप से बहाल करें; बैकअप को संक्रमित डिवाइस से अलग रखें।'
      ],
      message: [
        'रुकें। जवाब न दें, अटैचमेंट न खोलें, ऐप इंस्टॉल न करें, भुगतान कोड स्कैन न करें और पासवर्ड, OTP या PIN साझा न करें।',
        'दावे की स्वतंत्र जाँच करें। संस्था का ज्ञात आधिकारिक ऐप खोलें या वेबसाइट का पता स्वयं लिखें; संदिग्ध संदेश में दिए संपर्क विवरण इस्तेमाल न करें।',
        'प्लेटफ़ॉर्म के रिपोर्ट और ब्लॉक विकल्प इस्तेमाल करें। धमकी, धोखाधड़ी या खाते के दुरुपयोग की स्थिति में संबंधित साक्ष्य सुरक्षित रखें और आवश्यक होने पर आधिकारिक शिकायत सेवा का उपयोग करें।'
      ],
      access: 'यदि किसी अनजान व्यक्ति के पास डिवाइस का रिमोट एक्सेस है तो उसका नेटवर्क कनेक्शन काट दें। बैंक से संपर्क और खाते सुरक्षित करने के लिए दूसरा भरोसेमंद डिवाइस इस्तेमाल करें। दोबारा कनेक्ट करने से पहले योग्य तकनीकी सहायता लें।',
      scope: 'यह सामान्य मार्गदर्शन है। इससे शिकायत दर्ज नहीं होती, बैंक से संपर्क नहीं होता और पैसे वापस मिलने की गारंटी नहीं मिलती। यहाँ चुना गया कोई विकल्प सहेजा नहीं जाता।',
      invalid: 'आगे बढ़ने के लिए सूची में दिया गया विकल्प चुनें।',
      socTitle: 'प्रारंभिक जाँच का मूल्यांकन',
      socInvestigate: 'जाँच करें और आगे भेजें: उपलब्ध साक्ष्य के आधार पर उचित अगला कदम।',
      socClose: 'अलर्ट बंद करने से एक महत्वपूर्ण सवाल अनुत्तरित रह जाएगा।',
      socBlock: 'केवल IP ब्लॉक करना पूरी प्रतिक्रिया नहीं है।',
      socReasons: [
        'बार-बार असफल लॉगिन के बाद सफल लॉगिन और नया MFA पंजीकरण खाते पर कब्ज़े की संभावना दिखाते हैं। यह क्रम संदिग्ध है, लेकिन सेंध का प्रमाण नहीं है।',
        'पहचान संबंधी लॉग और समयरेखा सुरक्षित रखें। स्थापित संपर्क माध्यम से खाता धारक से जाँचें कि लॉगिन और MFA बदलाव अधिकृत थे या नहीं; डिवाइस, स्थान और सत्र का संदर्भ देखें।',
        'संस्था की घटना प्रतिक्रिया प्रक्रिया के अनुसार मामला आगे भेजें। सेंध की पुष्टि होने पर या नीति के अनुसार तत्काल रोकथाम ज़रूरी होने पर सत्र और टोकन रद्द करने, क्रेडेंशियल रीसेट करने तथा अनधिकृत MFA विधियाँ हटाने का समन्वय करें।'
      ],
      socLimit: 'काल्पनिक शिक्षण अभ्यास। एक IP साझा हो सकता है या बदल सकता है, इसलिए केवल IP ब्लॉक करने से सक्रिय सत्र समाप्त नहीं होता। यह पृष्ठ ये कार्रवाइयाँ नहीं करता।',
      quizProgress: 'प्रश्न {current} / {total}',
      quizChoose: 'जाँचने से पहले एक उत्तर चुनें।',
      quizCorrect: 'सही उत्तर।',
      quizWrong: 'इस उत्तर पर दोबारा विचार करें।',
      quizNext: 'अगला प्रश्न',
      quizFinish: 'परिणाम देखें',
      quizRestart: 'फिर प्रयास करें',
      quizDone: 'आपने {total} में से {score} प्रश्नों के सही उत्तर दिए।',
      quizDoneNote: 'अभ्यास जारी रखें: स्वतंत्र आधिकारिक माध्यम से जाँच करें, प्रमाणीकरण संबंधी गोपनीय जानकारी सुरक्षित रखें और नुकसान होने पर तुरंत कार्रवाई करें। आपके उत्तर सहेजे नहीं जाते।',
      quiz: [
        {
          question: 'एक संदेश echallan-parivahan.xyz पर तुरंत लंबित ई-चालान भरने को कहता है। सबसे पहले क्या करना चाहिए?',
          options: ['जुर्माने की धमकी से बचने के लिए तुरंत भुगतान करें।', 'आधिकारिक ई-चालान सेवा स्वयं खोलकर नोटिस जाँचें।', 'जवाब में ड्राइविंग लाइसेंस और बैंक की जानकारी भेजें।'],
          answer: 1,
          explanation: 'डोमेन के नाम में “parivahan” होने से वह आधिकारिक नहीं हो जाता। echallan.parivahan.gov.in पर स्वतंत्र जाँच करें। संदिग्ध संदेश का लिंक इस्तेमाल न करें।'
        },
        {
          question: 'एक कॉलर रिफंड भेजने के लिए आपका UPI PIN माँगता है। सबसे सुरक्षित प्रतिक्रिया क्या है?',
          options: ['उसे आपका नाम पता है तो PIN बताएँ।', 'एक बार में केवल एक अंक बताएँ।', 'कॉल समाप्त करें और आधिकारिक सेवा से रिफंड की जाँच करें।'],
          answer: 2,
          explanation: 'UPI PIN पैसे भेजने की अनुमति देता है; पैसे प्राप्त करने के लिए इसकी ज़रूरत नहीं होती। इसे न बताएँ और कॉलर के कहने पर न भरें।'
        },
        {
          question: 'धोखाधड़ी के बाद अभी आपके खाते से पैसे निकले हैं। कौन-सी प्रतिक्रिया सबसे उपयोगी है?',
          options: ['बैंक से तुरंत संपर्क करें और आधिकारिक धोखाधड़ी शिकायत सेवा इस्तेमाल करें।', 'सोशल मीडिया के “रिकवरी विशेषज्ञ” को अग्रिम शुल्क दें।', 'मदद माँगने से पहले सारे संदेश मिटा दें।'],
          answer: 0,
          explanation: 'बैंक को तुरंत सूचित करें और साक्ष्य सुरक्षित रखें। भारत में वित्तीय साइबर धोखाधड़ी के लिए 1930 पर कॉल करें और cybercrime.gov.in पर शिकायत करें। शिकायत से पैसे वापस मिलने की गारंटी नहीं है।'
        },
        {
          question: 'खाते में अनजान लॉगिन और आपके द्वारा न जोड़ी गई नई MFA विधि दिखती है। क्या करना चाहिए?',
          options: ['मान लें कि MFA होने से खाता सुरक्षित है।', 'आधिकारिक सेवा से खाता सुरक्षित करें, अनजान सत्र रद्द करें और रिकवरी सेटिंग जाँचें।', 'खाता वापस पाने के लिए किसी अनजान व्यक्ति को पासवर्ड भेजें।'],
          answer: 1,
          explanation: 'हमलावर अपनी MFA विधि जोड़ सकता है। भरोसेमंद डिवाइस और आधिकारिक रिकवरी प्रक्रिया इस्तेमाल करें, अनधिकृत पहुँच हटाएँ और रिकवरी ईमेल भी सुरक्षित करें।'
        },
        {
          question: 'फ़ाइलें अचानक एन्क्रिप्ट हो गईं और फिरौती का संदेश दिखता है। सबसे सुरक्षित पहला कदम क्या है?',
          options: ['प्रभावित डिवाइस का नेटवर्क कनेक्शन काटें, साक्ष्य सुरक्षित रखें और योग्य सहायता लें।', 'हर बैकअप ड्राइव जोड़कर जाँचें कि कौन-सी फ़ाइल खुलती है।', 'फिरौती माँगने वाले का भेजा रिकवरी प्रोग्राम इंस्टॉल करें।'],
          answer: 0,
          explanation: 'डिवाइस अलग करने से साझा ड्राइव और बैकअप तक फैलाव कम हो सकता है। सुरक्षित बैकअप संक्रमित सिस्टम से न जोड़ें; बहाली से पहले साक्ष्य सुरक्षित रखें और योग्य सहायता लें।'
        }
      ],
      assistantTitle: 'व्यावहारिक मार्गदर्शन',
      assistantNote: 'यह डिवाइस पर चलने वाला विषय-आधारित मार्गदर्शक है। यह स्वतंत्र पाठ नहीं समझता, खातों तक नहीं पहुँचता और आपात सेवाओं से संपर्क नहीं करता।',
      assistant: {
        payment: ['पैसे प्राप्त करने के लिए UPI PIN या OTP साझा करना ज़रूरी नहीं है। भुगतान की अनुमति देने से पहले प्राप्तकर्ता और राशि जाँचें।', 'पैसे का नुकसान हुआ है तो बैंक के आधिकारिक माध्यम से तुरंत संपर्क करें। भारत में 1930 पर कॉल करें और cybercrime.gov.in इस्तेमाल करें। लेन-देन संदर्भ सुरक्षित रखें।'],
        otp: ['किसी कॉलर को या चैट में OTP, पासवर्ड या PIN कभी न बताएँ। आने वाली कॉल पर परिचित नाम या नंबर दिखना पहचान का प्रमाण नहीं है।', 'गोपनीय जानकारी साझा की है तो भरोसेमंद डिवाइस से खाता सुरक्षित करें, अनजान सत्र रद्द करें और संबंधित सेवा से संपर्क करें। बैंकिंग जानकारी के लिए बैंक को तुरंत कॉल करें।'],
        device: ['अनजान कॉलर का भेजा रिमोट एक्सेस सॉफ़्टवेयर या APK इंस्टॉल न करें। आधिकारिक ऐप स्टोर और संस्था की सत्यापित वेबसाइट इस्तेमाल करें।', 'रिमोट कंट्रोल सक्रिय है तो डिवाइस का नेटवर्क कनेक्शन काट दें। खाते सुरक्षित करने और बैंक से संपर्क के लिए दूसरा भरोसेमंद डिवाइस इस्तेमाल करें; योग्य तकनीकी सहायता लें।'],
        report: ['भारत में वित्तीय साइबर धोखाधड़ी के लिए तुरंत 1930 पर कॉल करें और cybercrime.gov.in पर शिकायत करें। तत्काल शारीरिक खतरे में स्थानीय आपात सेवा से संपर्क करें।', 'संबंधित साक्ष्य निजी रूप से सुरक्षित रखें। यह स्वतंत्र वेबसाइट शिकायतें स्वीकार नहीं करती और किसी सरकारी एजेंसी का प्रतिनिधित्व नहीं करती। अंतरराष्ट्रीय आगंतुक स्थानीय मार्गदर्शन के लिए आधिकारिक निर्देशिका देखें।']
      }
    },
    te: {
      planTitle: 'మీ తదుపరి చర్యలు',
      money: [
        'మీ బ్యాంక్ లేదా చెల్లింపు సంస్థ అధికారిక యాప్ లేదా ధృవీకరించిన నంబర్ ద్వారా వెంటనే సంప్రదించండి. ఖాతాను భద్రపరచి, లావాదేవీని వెనక్కి రప్పించే ప్రయత్నం చేయమని మోసాల విభాగాన్ని అడగండి; డబ్బు తిరిగి వస్తుందని హామీ లేదు.',
        'భారతదేశంలో ఆర్థిక సైబర్ మోసం జరిగితే వెంటనే 1930కు కాల్ చేసి cybercrime.gov.inలో ఫిర్యాదు చేయండి. భారతదేశం బయట స్థానిక పోలీసులను, జాతీయ ఫిర్యాదు సేవను సంప్రదించండి.',
        'బ్యాంక్ మరియు ఫిర్యాదు అధికారుల కోసం లావాదేవీ వివరాలు, తేదీలు, సందేశాలు, స్క్రీన్‌షాట్‌లను భద్రపరచండి. సున్నితమైన ఆధారాలను బహిరంగంగా పెట్టవద్దు; డబ్బు తిరిగి తెస్తామని చెప్పేవారికి మరింత డబ్బు చెల్లించవద్దు.'
      ],
      credentials: [
        'నమ్మదగిన పరికరంలో సేవను మీరే తెరిచి ప్రభావిత పాస్‌వర్డ్‌ను మార్చండి. అదే పాస్‌వర్డ్‌ను ఇతర ఖాతాల్లో వాడితే వాటినీ మార్చండి.',
        'సేవ భద్రతా సెట్టింగ్‌లలో తెలియని సెషన్‌లను ముగించి, అనుమానాస్పద యాప్‌ల అనుమతులను రద్దు చేయండి. రికవరీ ఈమెయిల్, ఫోన్ నంబర్‌లను తనిఖీ చేసి బలమైన బహుళ-అంచెల ప్రమాణీకరణను ప్రారంభించండి.',
        'OTP, UPI PIN లేదా బ్యాంకింగ్ సమాచారం పంచుకుంటే బ్యాంక్ అధికారిక మార్గంలో వెంటనే సంప్రదించండి. లావాదేవీలను గమనించి నష్టం జరిగితే వెంటనే ఫిర్యాదు చేయండి.'
      ],
      account: [
        'నమ్మదగిన పరికరంలో సేవ అధికారిక యాప్ లేదా తెలిసిన వెబ్‌సైట్ తెరవండి. సైన్‌ఇన్ చేయలేకపోతే అధికారిక ఖాతా పునరుద్ధరణ విధానాన్ని వాడండి; డబ్బు తీసుకుని ఖాతా తిరిగి ఇస్తామని చెప్పే తెలియని వ్యక్తులను నమ్మవద్దు.',
        'ఇంకా ఖాతాలోకి ప్రవేశించగలిగితే పాస్‌వర్డ్ మార్చి, తెలియని సెషన్‌లను ముగించి, అనుమానాస్పద యాప్‌ల అనుమతులు రద్దు చేసి, రికవరీ వివరాలు మరియు MFA పద్ధతులను తనిఖీ చేయండి. రికవరీ ఈమెయిల్ ఖాతాను కూడా భద్రపరచండి.',
        'ఖాతా నుంచి మోసపూరిత సందేశాలు వెళ్లినట్లయితే సంబంధిత పరిచయస్తులకు మరో నమ్మదగిన మార్గంలో హెచ్చరించండి. ఆధారాలను భద్రపరచి, వేషధారణ లేదా ఖాతా ఆక్రమణ గురించి సేవ అధికారిక సహాయ విభాగానికి ఫిర్యాదు చేయండి.'
      ],
      malware: [
        'వ్యాప్తిని తగ్గించడానికి ప్రభావిత పరికరాన్ని వై-ఫై, ఈథర్‌నెట్ మరియు భాగస్వామ్య డ్రైవ్‌ల నుంచి వేరు చేయండి. ముఖ్యమైన ఖాతాలను భద్రపరచడానికి, చెల్లింపులు ప్రభావితమైతే బ్యాంకును సంప్రదించడానికి మరో నమ్మదగిన పరికరం వాడండి.',
        'కాలర్ పంపిన “క్లీనర్”ను ఇన్‌స్టాల్ చేయవద్దు, విమోచన డబ్బు చెల్లించవద్దు; తెలియని రికవరీ సాధనాలు నడపవద్దు. మరిన్ని ఫైల్‌లు తెరవకుండా కనిపించే హెచ్చరికలను నమోదు చేసి అర్హతగల సాంకేతిక లేదా సంఘటన స్పందన సహాయం పొందండి.',
        'పరికరాన్ని రీసెట్ చేయడానికి లేదా చెరిపివేయడానికి ముందు సంబంధిత ఆధారాలను భద్రపరచండి. ముప్పును తొలగించి సిస్టమ్‌ను తిరిగి నిర్మించిన తర్వాత లేదా శుభ్రమని నిర్ధారించిన తర్వాత మాత్రమే సురక్షిత బ్యాకప్ నుంచి పునరుద్ధరించండి; బ్యాకప్‌లను సోకిన పరికరానికి కనెక్ట్ చేయవద్దు.'
      ],
      message: [
        'ఆగండి. జవాబు ఇవ్వవద్దు, జోడింపులు తెరవవద్దు, యాప్ ఇన్‌స్టాల్ చేయవద్దు, చెల్లింపు కోడ్ స్కాన్ చేయవద్దు; పాస్‌వర్డ్, OTP లేదా PIN పంచుకోవద్దు.',
        'సందేశంలోని వాదనను స్వతంత్రంగా నిర్ధారించండి. సంస్థ అధికారిక యాప్‌ను తెరవండి లేదా తెలిసిన అధికారిక వెబ్ చిరునామాను మీరే టైప్ చేయండి; అనుమానాస్పద సందేశంలోని సంప్రదింపు వివరాలను వాడవద్దు.',
        'ప్లాట్‌ఫారమ్‌లోని రిపోర్ట్, బ్లాక్ ఎంపికలను వాడండి. బెదిరింపులు, మోసం లేదా ఖాతా దుర్వినియోగం జరిగితే సంబంధిత ఆధారాలను భద్రపరచి అవసరమైనప్పుడు అధికారిక ఫిర్యాదు సేవలను వాడండి.'
      ],
      access: 'తెలియని వ్యక్తికి మీ పరికరంపై రిమోట్ యాక్సెస్ ఉంటే నెట్‌వర్క్ కనెక్షన్‌ను తొలగించండి. బ్యాంకును సంప్రదించడానికి, ఖాతాలను భద్రపరచడానికి మరో నమ్మదగిన పరికరాన్ని వాడండి. తిరిగి కనెక్ట్ చేయడానికి ముందు అర్హతగల సాంకేతిక సహాయం పొందండి.',
      scope: 'ఇది సాధారణ మార్గదర్శకం. ఇది ఫిర్యాదు చేయదు, బ్యాంకును సంప్రదించదు; డబ్బు తిరిగి వస్తుందని హామీ ఇవ్వదు. ఇక్కడ ఎంచుకున్న ఎంపికలు సేవ్ కావు.',
      invalid: 'కొనసాగించడానికి జాబితాలోని ఒక ఎంపికను ఎంచుకోండి.',
      socTitle: 'ప్రాథమిక పరిశీలన అంచనా',
      socInvestigate: 'పరిశీలించి పైస్థాయికి తెలియజేయడం: ఆధారాలకు తగిన తదుపరి చర్య.',
      socClose: 'ఈ అలర్ట్‌ను మూసివేస్తే ఒక ముఖ్యమైన ప్రశ్నకు సమాధానం లభించదు.',
      socBlock: 'IPని బ్లాక్ చేయడం మాత్రమే పూర్తి స్పందన కాదు.',
      socReasons: [
        'పదేపదే విఫలమైన సైన్‌ఇన్‌ల తర్వాత విజయవంతమైన సైన్‌ఇన్, కొత్త MFA నమోదు కనిపించడం ఖాతా ఆక్రమణకు సూచన కావచ్చు. ఈ క్రమం అనుమానాస్పదం; కానీ చొరబాటును నిరూపించదు.',
        'గుర్తింపు లాగ్‌లు, సంఘటనల సమయక్రమాన్ని భద్రపరచండి. సైన్‌ఇన్, MFA మార్పు అనుమతితో జరిగాయో ఖాతా యజమానితో స్థాపిత సంప్రదింపు మార్గంలో నిర్ధారించండి; పరికరం, ప్రదేశం, సెషన్ వివరాలను పరిశీలించండి.',
        'సంస్థ సంఘటన స్పందన విధానం ప్రకారం పైస్థాయికి తెలియజేయండి. చొరబాటు నిర్ధారణ అయితే లేదా విధానం ప్రకారం తక్షణ నియంత్రణ అవసరమైతే సెషన్‌లు, టోకెన్‌ల రద్దు, ప్రవేశ రహస్యాల రీసెట్, అనధికార MFA పద్ధతుల తొలగింపును సమన్వయం చేయండి.'
      ],
      socLimit: 'కల్పిత అభ్యాసం. ఒక IPని పలువురు వాడవచ్చు లేదా అది మారవచ్చు; కాబట్టి IPని బ్లాక్ చేయడం మాత్రమే క్రియాశీల సెషన్‌ను ముగించదు. ఈ పేజీ ఆ చర్యలను అమలు చేయదు.',
      quizProgress: 'ప్రశ్న {current} / {total}',
      quizChoose: 'తనిఖీ చేయడానికి ముందు ఒక సమాధానాన్ని ఎంచుకోండి.',
      quizCorrect: 'సరైన సమాధానం.',
      quizWrong: 'ఈ సమాధానాన్ని మళ్లీ పరిశీలించండి.',
      quizNext: 'తదుపరి ప్రశ్న',
      quizFinish: 'ఫలితం చూడండి',
      quizRestart: 'మళ్లీ ప్రయత్నించండి',
      quizDone: 'మీరు {total} ప్రశ్నల్లో {score} ప్రశ్నలకు సరిగ్గా సమాధానం ఇచ్చారు.',
      quizDoneNote: 'అభ్యాసం కొనసాగించండి: స్వతంత్ర అధికారిక మార్గంలో ధృవీకరించండి, ప్రమాణీకరణ రహస్యాలను కాపాడండి; నష్టం జరిగితే త్వరగా స్పందించండి. మీ సమాధానాలు సేవ్ కావు.',
      quiz: [
        {
          question: 'పెండింగ్ ఈ-చలాన్‌ను echallan-parivahan.xyzలో వెంటనే చెల్లించాలని ఒక సందేశం చెబుతోంది. మొదట ఏం చేయాలి?',
          options: ['జరిమానా బెదిరింపును తప్పించుకోవడానికి వెంటనే చెల్లించాలి.', 'అధికారిక ఈ-చలాన్ సేవను స్వయంగా తెరిచి నోటీసును నిర్ధారించాలి.', 'డ్రైవింగ్ లైసెన్స్, బ్యాంక్ వివరాలతో జవాబు ఇవ్వాలి.'],
          answer: 1,
          explanation: 'డొమైన్ పేరులో “parivahan” ఉన్నంత మాత్రాన అది అధికారికం కాదు. echallan.parivahan.gov.inలో స్వతంత్రంగా నిర్ధారించండి. అనుమానాస్పద సందేశంలోని లింక్‌ను వాడవద్దు.'
        },
        {
          question: 'రిఫండ్ పంపడానికి మీ UPI PIN కావాలని ఒక కాలర్ అడిగారు. అత్యంత సురక్షిత స్పందన ఏది?',
          options: ['వారికి మీ పేరు తెలిస్తే PIN ఇవ్వాలి.', 'ఒక్కో అంకె చొప్పున మాత్రమే చెప్పాలి.', 'కాల్ ముగించి అధికారిక సేవ ద్వారా రిఫండ్‌ను నిర్ధారించాలి.'],
          answer: 2,
          explanation: 'UPI PIN డబ్బు పంపే లావాదేవీకి అనుమతి ఇస్తుంది; డబ్బు అందుకోవడానికి అది అవసరం లేదు. దాన్ని చెప్పవద్దు; కాలర్ చెప్పినందుకు నమోదు చేయవద్దు.'
        },
        {
          question: 'మోసం కారణంగా ఇప్పుడే మీ ఖాతా నుంచి డబ్బు పోయింది. ఏ స్పందన ఉపయోగకరం?',
          options: ['వెంటనే బ్యాంకును సంప్రదించి అధికారిక మోసం ఫిర్యాదు సేవను వాడాలి.', 'సోషల్ మీడియాలో “రికవరీ నిపుణుడు”కి ముందస్తు రుసుము ఇవ్వాలి.', 'సహాయం అడిగే ముందు సందేశాలన్నీ తొలగించాలి.'],
          answer: 0,
          explanation: 'బ్యాంకుకు వెంటనే తెలియజేసి ఆధారాలను భద్రపరచండి. భారతదేశంలో ఆర్థిక సైబర్ మోసానికి 1930కు కాల్ చేసి cybercrime.gov.inలో ఫిర్యాదు చేయండి. ఫిర్యాదు చేసినంత మాత్రాన డబ్బు తిరిగి వస్తుందని హామీ లేదు.'
        },
        {
          question: 'ఖాతాలో తెలియని సైన్‌ఇన్‌లు, మీరు జోడించని కొత్త MFA పద్ధతి కనిపిస్తున్నాయి. ఏం చేయాలి?',
          options: ['MFA ఉంది కాబట్టి ఖాతా సురక్షితమే అనుకోవాలి.', 'అధికారిక సేవ ద్వారా ఖాతాను భద్రపరచి తెలియని సెషన్‌లను రద్దు చేసి రికవరీ సెట్టింగ్‌లను తనిఖీ చేయాలి.', 'ఖాతా తిరిగి పొందడానికి తెలియని వ్యక్తికి పాస్‌వర్డ్ పంపాలి.'],
          answer: 1,
          explanation: 'దాడి చేసే వ్యక్తి తన MFA పద్ధతిని జోడించవచ్చు. నమ్మదగిన పరికరం, అధికారిక రికవరీ విధానం వాడి అనధికార ప్రవేశాన్ని తొలగించి రికవరీ ఈమెయిల్‌ను కూడా భద్రపరచండి.'
        },
        {
          question: 'అనుకోకుండా ఫైల్‌లు గూఢలిపీకరించబడి డబ్బు డిమాండ్ చేసే సందేశం కనిపిస్తోంది. అత్యంత సురక్షిత మొదటి చర్య ఏది?',
          options: ['ప్రభావిత పరికరాన్ని నెట్‌వర్క్ నుంచి వేరు చేసి, ఆధారాలను భద్రపరుస్తూ అర్హతగల సహాయం పొందాలి.', 'ఏ ఫైల్‌లు తెరుచుకుంటాయో చూడటానికి అన్ని బ్యాకప్ డ్రైవ్‌లను కనెక్ట్ చేయాలి.', 'డబ్బు డిమాండ్ చేసిన వ్యక్తి పంపిన రికవరీ ప్రోగ్రామ్‌ను ఇన్‌స్టాల్ చేయాలి.'],
          answer: 0,
          explanation: 'పరికరాన్ని వేరు చేయడం భాగస్వామ్య డ్రైవ్‌లు, బ్యాకప్‌లకు వ్యాప్తిని తగ్గించవచ్చు. శుభ్రమైన బ్యాకప్‌లను సోకిన సిస్టమ్‌కు కనెక్ట్ చేయవద్దు; పునరుద్ధరణకు ముందు ఆధారాలు భద్రపరచి అర్హతగల సహాయం పొందండి.'
        }
      ],
      assistantTitle: 'ఆచరణాత్మక మార్గదర్శకం',
      assistantNote: 'ఇది పరికరంలోనే పనిచేసే అంశాల ఆధారిత మార్గదర్శి. ఇది స్వేచ్ఛగా రాసిన పాఠ్యాన్ని అర్థం చేసుకోదు, ఖాతాలను చూడదు; అత్యవసర సేవలను సంప్రదించదు.',
      assistant: {
        payment: ['డబ్బు అందుకోవడానికి UPI PIN లేదా OTP పంచుకోవాల్సిన అవసరం లేదు. ఏ చెల్లింపునైనా ఆమోదించే ముందు గ్రహీతను, మొత్తాన్ని తనిఖీ చేయండి.', 'డబ్బు పోయినట్లయితే బ్యాంక్ అధికారిక మార్గంలో వెంటనే సంప్రదించండి. భారతదేశంలో 1930కు కాల్ చేసి cybercrime.gov.inను వాడండి. లావాదేవీ వివరాలను భద్రపరచండి.'],
        otp: ['కాలర్‌కు లేదా చాట్‌లో OTP, పాస్‌వర్డ్ లేదా PIN ఎప్పుడూ చెప్పవద్దు. వచ్చే కాల్‌లో తెలిసిన పేరు లేదా నంబర్ కనిపించడం గుర్తింపుకు రుజువు కాదు.', 'రహస్యాన్ని పంచుకున్నట్లయితే నమ్మదగిన పరికరం నుంచి ఖాతాను భద్రపరచి తెలియని సెషన్‌లను రద్దు చేసి సంబంధిత సేవను సంప్రదించండి. బ్యాంకింగ్ వివరాలైతే వెంటనే బ్యాంకుకు కాల్ చేయండి.'],
        device: ['తెలియని కాలర్ పంపిన రిమోట్ యాక్సెస్ సాఫ్ట్‌వేర్ లేదా APKని ఇన్‌స్టాల్ చేయవద్దు. అధికారిక యాప్ స్టోర్‌లు, సంస్థ ధృవీకరించిన వెబ్‌సైట్‌ను వాడండి.', 'రిమోట్ కంట్రోల్ క్రియాశీలంగా ఉంటే పరికరం నెట్‌వర్క్ కనెక్షన్‌ను తొలగించండి. ఖాతాలను భద్రపరచడానికి, బ్యాంకును సంప్రదించడానికి మరో నమ్మదగిన పరికరం వాడండి; అర్హతగల సాంకేతిక సహాయం పొందండి.'],
        report: ['భారతదేశంలో ఆర్థిక సైబర్ మోసానికి వెంటనే 1930కు కాల్ చేసి cybercrime.gov.inలో ఫిర్యాదు చేయండి. తక్షణ భౌతిక ప్రమాదం ఉంటే స్థానిక అత్యవసర సేవను సంప్రదించండి.', 'సంబంధిత ఆధారాలను వ్యక్తిగతంగా భద్రపరచండి. ఈ స్వతంత్ర వెబ్‌సైట్ ఫిర్యాదులను స్వీకరించదు; ప్రభుత్వ సంస్థకు ప్రాతినిధ్యం వహించదు. అంతర్జాతీయ సందర్శకులు స్థానిక మార్గదర్శకం కోసం అధికారిక డైరెక్టరీని చూడాలి.']
      }
    }
  };
  const text = copy[language] || copy.en;

  function paragraph(value) {
    const node = document.createElement('p');
    node.textContent = value;
    return node;
  }

  function showGuidance(container, heading, steps, note) {
    if (!container) return;
    const title = document.createElement('h3');
    title.textContent = heading;
    const list = document.createElement('ol');
    for (const step of steps) {
      const item = document.createElement('li');
      item.textContent = step;
      list.append(item);
    }
    container.replaceChildren(title, list);
    if (note) container.append(paragraph(note));
    container.hidden = false;
  }

  const planner = document.getElementById('planner-form');
  if (planner) {
    let latestPlan = [];
    const download = document.getElementById('planner-download');
    if (download) {
      download.disabled = true;
      download.addEventListener('click', function () {
        if (!latestPlan.length) return;
        const contents = [
          'CYBER SURAKSHA 2.0', text.planTitle, '',
          ...latestPlan.map(function (step, index) { return String(index + 1) + '. ' + step; }),
          '', text.scope
        ].join('\n\n');
        const file = new Blob(['\ufeff', contents], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'cyber-suraksha-action-plan.txt';
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      });
    }
    planner.addEventListener('change', function () {
      latestPlan = [];
      if (download) download.disabled = true;
      const result = document.getElementById('planner-results');
      if (result) result.hidden = true;
    });
    planner.addEventListener('submit', function (event) {
      event.preventDefault();
      const situation = document.getElementById('planner-situation').value;
      const remoteAccess = document.getElementById('planner-access').value;
      const lossChoice = document.getElementById('planner-loss');
      const financialLoss = lossChoice ? lossChoice.value : 'no';
      const result = document.getElementById('planner-results');
      if (!['money', 'credentials', 'message', 'account', 'malware'].includes(situation) ||
          !['yes', 'no'].includes(remoteAccess) || !['yes', 'no'].includes(financialLoss)) {
        latestPlan = [];
        if (download) download.disabled = true;
        showGuidance(result, text.planTitle, [text.invalid]);
        return;
      }
      const steps = text[situation].slice();
      if (financialLoss === 'yes' && situation !== 'money') steps.unshift(text.money[0], text.money[1]);
      if (remoteAccess === 'yes') steps.unshift(text.access);
      latestPlan = steps.slice();
      if (download) download.disabled = false;
      showGuidance(result, text.planTitle, steps, text.scope);
    });
  }

  const soc = document.getElementById('soc-form');
  if (soc) {
    soc.addEventListener('submit', function (event) {
      event.preventDefault();
      const decision = document.getElementById('soc-decision').value;
      const result = document.getElementById('soc-results');
      const decisionText = {
        investigate: text.socInvestigate,
        close: text.socClose,
        block: text.socBlock
      };
      if (!Object.hasOwn(decisionText, decision)) {
        showGuidance(result, text.socTitle, [text.invalid]);
        return;
      }
      showGuidance(result, decisionText[decision], text.socReasons, text.socLimit);
    });
  }

  const assistant = document.getElementById('assistant-form');
  if (assistant) {
    assistant.addEventListener('submit', function (event) {
      event.preventDefault();
      const topic = document.getElementById('assistant-topic').value;
      const steps = Object.hasOwn(text.assistant, topic) ? text.assistant[topic] : [text.invalid];
      showGuidance(document.getElementById('assistant-results'), text.assistantTitle, steps, text.assistantNote);
    });
  }

  const quiz = document.getElementById('quiz-form');
  if (!quiz) return;
  const question = document.getElementById('quiz-question');
  const options = document.getElementById('quiz-options');
  const feedback = document.getElementById('quiz-feedback');
  const submit = document.getElementById('quiz-submit');
  const next = document.getElementById('quiz-next');
  if (!question || !options || !feedback || !submit || !next) return;
  let questionIndex = 0;
  let correctAnswers = 0;
  let answered = false;
  let complete = false;

  function format(value, replacements) {
    return value.replace(/\{(\w+)\}/g, function (match, key) {
      return Object.hasOwn(replacements, key) ? String(replacements[key]) : match;
    });
  }

  function renderQuestion() {
    const entry = text.quiz[questionIndex];
    const progress = document.createElement('p');
    progress.className = 'eyebrow';
    progress.textContent = format(text.quizProgress, { current: questionIndex + 1, total: text.quiz.length });
    const title = document.createElement('h3');
    title.id = 'quiz-question-title';
    title.textContent = entry.question;
    question.replaceChildren(progress, title);
    options.setAttribute('role', 'radiogroup');
    options.setAttribute('aria-labelledby', title.id);
    options.replaceChildren();
    entry.options.forEach(function (value, index) {
      const label = document.createElement('label');
      label.className = 'quiz-option';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'quiz-answer';
      input.value = String(index);
      input.required = true;
      const labelText = document.createElement('span');
      labelText.textContent = value;
      label.append(input, labelText);
      options.append(label);
    });
    feedback.replaceChildren();
    feedback.hidden = true;
    submit.hidden = false;
    submit.disabled = false;
    next.hidden = true;
    next.type = 'button';
    next.textContent = questionIndex === text.quiz.length - 1 ? text.quizFinish : text.quizNext;
    answered = false;
  }

  quiz.addEventListener('submit', function (event) {
    event.preventDefault();
    if (answered || complete) return;
    const selected = options.querySelector('input:checked');
    if (!selected) {
      feedback.replaceChildren(paragraph(text.quizChoose));
      feedback.hidden = false;
      return;
    }
    const entry = text.quiz[questionIndex];
    const correct = Number(selected.value) === entry.answer;
    if (correct) correctAnswers += 1;
    answered = true;
    options.querySelectorAll('input').forEach(function (input) { input.disabled = true; });
    feedback.replaceChildren(paragraph(correct ? text.quizCorrect : text.quizWrong), paragraph(entry.explanation));
    feedback.hidden = false;
    submit.disabled = true;
    next.hidden = false;
  });

  next.addEventListener('click', function () {
    if (complete) {
      questionIndex = 0;
      correctAnswers = 0;
      complete = false;
      renderQuestion();
      return;
    }
    if (!answered) return;
    if (questionIndex < text.quiz.length - 1) {
      questionIndex += 1;
      renderQuestion();
      return;
    }
    complete = true;
    question.replaceChildren(paragraph(format(text.quizDone, { score: correctAnswers, total: text.quiz.length })));
    options.replaceChildren();
    feedback.replaceChildren(paragraph(text.quizDoneNote));
    feedback.hidden = false;
    submit.hidden = true;
    next.textContent = text.quizRestart;
  });

  renderQuestion();
}());

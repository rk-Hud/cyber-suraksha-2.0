/* Transparent, deterministic warning-sign rules. No network calls or telemetry. */
(function(root,factory){const lib=factory();if(typeof module==='object'&&module.exports)module.exports=lib;root.CyberScamCore=lib})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const RULES=[
{id:'credential',weight:34,pattern:/(?:\botp\b|one[\s-]*time\s*(?:password|code)|verification\s*code|\bpin\b|\bcvv\b|पासवर्ड|ओटीपी|पिन\s*(?:बताओ|डाल)|పిన్|ఓటీపీ|పాస్.?వర్డ్|otp\s*(?:cheppu|pampandi|share|send))/iu},
{id:'payment',weight:25,pattern:/(?:registration\s*fee|processing\s*fee|pay\s*(?:now|immediately|first)|send\s*money|upi\s*pin|collect\s*request|payment\s*required|रजिस्ट्रेशन\s*फीस|पैसे\s*भेज|भुगतान\s*करें|ఫీజు\s*చెల్లించ|డబ్బు\s*పంపండి|dabbulu\s*pamp|fee\s*katt)/iu},
{id:'urgency',weight:14,pattern:/(?:immediately|within\s*(?:10|15|30)\s*minutes|urgent(?:ly)?|last\s*chance|account\s*(?:will\s*be|is)\s*(?:blocked|suspended)|तुरंत|अभी\s*करें|खाता\s*बंद|వెంటనే|తక్షణం|ఖాతా\s*బ్లాక్|ippude|ventane)/iu},
{id:'prize',weight:15,pattern:/(?:won\s*(?:a|the)?\s*(?:prize|lottery)|cashback|claim\s*your\s*(?:reward|gift)|guaranteed\s*(?:return|profit)|लॉटरी|इनाम|कैशबैक|బహుమతి|లాటరీ|క్యాష్.?బ్యాక్)/iu},
{id:'remote',weight:29,pattern:/(?:anydesk|teamviewer|screen\s*shar(?:ing|e)|remote\s*access|install\s*app\s*to\s*(?:verify|help)|स्क्रीन\s*शेयर|रिमोट\s*एक्सेस|స్క్రీన్\s*షేర్|రిమోట్\s*యాక్సెస్)/iu},
{id:'link',weight:14,pattern:/(?:https?:\/\/[^\s]+|\bwww\.[^\s]+|\b(?:bit\.ly|tinyurl\.com|t\.co|shorturl\.at)\/\S+)/iu},
{id:'impersonation',weight:22,pattern:/(?:police\s*(?:notice|officer)|digital\s*arrest|government\s*officer|bank\s*verification|kyc\s*(?:expired|update|pending)|पुलिस\s*नोटिस|डिजिटल\s*अरेस्ट|केवाईसी|పోలీస్\s*నోటీసు|డిజిటల్\s*అరెస్ట్|కేవైసీ)/iu},
{id:'job',weight:22,pattern:/(?:job\s*(?:offer|selected)|selected\s*for\s*(?:the\s*)?(?:job|post)|work\s*from\s*home.*(?:earn|pay)|नौकरी\s*पक्की|नौकरी\s*के\s*लिए\s*फीस|ఉద్యోగం\s*ఎంపిక|జాబ్\s*ఆఫర్|job\s*ki\s*select)/iu}
];
function analyze(input){const text=String(input||'').trim().slice(0,2000);if(!text)return{level:'empty',score:0,matches:[],length:0};const matches=RULES.filter(r=>r.pattern.test(text)).map(r=>r.id);const raw=RULES.filter(r=>matches.includes(r.id)).reduce((a,r)=>a+r.weight,0);const score=Math.min(95,raw);return{level:score>=54?'high':score>=20?'medium':'low',score,matches,length:text.length};}
return{analyze,RULES};});

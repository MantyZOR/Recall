export const LAN_TLS_PORT=8443;
export const LAN_SETUP_PORT=8788;
const alphabet='0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const locatorPattern='[0-9A-HJKMNP-TV-Z]{5}';
const localPattern=new RegExp('^recall-(?:[a-f0-9]{12}|'+locatorPattern.toLowerCase()+')\\.local$');

export function locatorFromFingerprint(fingerprint){
 const hex=fingerprint.replaceAll(':','').toLowerCase();
 if(!/^[a-f0-9]{64}$/.test(hex))throw Error('Некорректный отпечаток сертификата');
 let value=Number.parseInt(hex.slice(0,7),16)>>>3,result='';
 for(let i=0;i<5;i++){result=alphabet[value&31]+result;value>>>=5;}
 return result;
}
export function isRecallLocalName(name){return localPattern.test(name);}
export function shortLocalName(locator){return 'recall-'+locator.toLowerCase()+'.local';}
export function readLanCode(input){
 const code=String(input).toUpperCase().replace(/[\s\u2010-\u2015-]/g,'');
 if(code.length!==11)return null;
 const locator=code.slice(0,5).replace(/O/g,'0').replace(/[IL]/g,'1'),pin=code.slice(5);
 if(!new RegExp('^'+locatorPattern+'$').test(locator)||!/^\d{6}$/.test(pin))return null;
 const name=shortLocalName(locator);
 return {code:locator+'-'+pin,origin:'https://'+name+':'+LAN_TLS_PORT,setupOrigin:'http://'+name+':'+LAN_SETUP_PORT};
}

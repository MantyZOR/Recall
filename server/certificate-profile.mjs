import { createHash, X509Certificate } from 'node:crypto';
function uuid(bytes,label) {
  const chars=createHash('sha256').update(bytes).update(label).digest('hex').slice(0,32).split('');
  chars[12]='4';chars[16]=((parseInt(chars[16],16)&3)|8).toString(16);
  const value=chars.join('');
  return value.slice(0,8)+'-'+value.slice(8,12)+'-'+value.slice(12,16)+'-'+value.slice(16,20)+'-'+value.slice(20);
}
// Apple CertificateRoot payload: one public CA, no device management or other settings.
export function certificateProfile(bytes) {
  const certificate=new X509Certificate(bytes);
  if(!certificate.ca)throw Error('Для профиля нужен корневой сертификат CA.');
  const suffix=createHash('sha256').update(bytes).digest('hex').slice(0,16);
  return '<?xml version="1.0" encoding="UTF-8"?>\n'+
'<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'+
'<plist version="1.0"><dict>\n'+
'<key>PayloadContent</key><array><dict>\n'+
'<key>PayloadCertificateFileName</key><string>Recall-Local-CA.cer</string>\n'+
'<key>PayloadContent</key><data>'+Buffer.from(bytes).toString('base64')+'</data>\n'+
'<key>PayloadDescription</key><string>Сертификат для защищённого подключения к Recall на твоём компьютере.</string>\n'+
'<key>PayloadDisplayName</key><string>Recall Local CA</string>\n'+
'<key>PayloadIdentifier</key><string>local.recall.ca.'+suffix+'.certificate</string>\n'+
'<key>PayloadType</key><string>com.apple.security.root</string>\n'+
'<key>PayloadUUID</key><string>'+uuid(bytes,'certificate')+'</string>\n'+
'<key>PayloadVersion</key><integer>1</integer>\n'+
'</dict></array>\n'+
'<key>PayloadDisplayName</key><string>Recall Local CA</string>\n'+
'<key>PayloadDescription</key><string>Только корневой сертификат Recall. После установки включи полное доверие в настройках сертификатов.</string>\n'+
'<key>PayloadIdentifier</key><string>local.recall.ca.'+suffix+'</string>\n'+
'<key>PayloadType</key><string>Configuration</string>\n'+
'<key>PayloadUUID</key><string>'+uuid(bytes,'profile')+'</string>\n'+
'<key>PayloadVersion</key><integer>1</integer>\n'+
'<key>PayloadRemovalDisallowed</key><false/>\n'+
'</dict></plist>\n';
}

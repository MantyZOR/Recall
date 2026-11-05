import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const applicationRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const installed=existsSync(path.join(applicationRoot,'.recall-installed'));
const stateRoot=installed?path.dirname(applicationRoot):applicationRoot;
export const dataPath=path.resolve(process.env.RECALL_DATA_DIR||path.join(stateRoot,'data'));
export const certPath=path.resolve(process.env.RECALL_CERTS_DIR||path.join(stateRoot,'certs'));

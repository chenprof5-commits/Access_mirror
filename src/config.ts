import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// Netlify Server runtime may not expose the build-only NETLIFY flag. The managed
// database connection is injected at runtime and is a reliable platform signal.
const isNetlify=process.env.NETLIFY==='true'||Boolean(process.env.NETLIFY_DB_URL);
const isProduction=process.env.NODE_ENV==='production'||(isNetlify&&process.env.CONTEXT==='production');
const externalConfig=process.env.ALPHA_PRIVATE_CONFIG_PATH;
if(isProduction&&!isNetlify&&!externalConfig)throw new Error('Production exige ALPHA_PRIVATE_CONFIG_PATH défini par le service.');
const envPath=externalConfig?path.resolve(externalConfig):path.resolve(root,'.env');
if(externalConfig&&!isNetlify){
 if(!path.isAbsolute(externalConfig))throw new Error('ALPHA_PRIVATE_CONFIG_PATH doit être absolu.');
 const rel=path.relative(root,envPath);if(!rel||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)))throw new Error('Le fichier privé doit se trouver hors du projet.');
}
if(isProduction&&!isNetlify&&!fs.existsSync(envPath))throw new Error('Le fichier privé de production est absent.');
const values:Record<string,string>={...process.env as Record<string,string>};
if(fs.existsSync(envPath)){
 const stat=fs.lstatSync(envPath);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('La configuration doit être un fichier régulier, sans lien symbolique.');
 const seen=new Set<string>();
 for(const [index,line] of fs.readFileSync(envPath,'utf8').split(/\r?\n/).entries()){
  if(!line.trim()||line.trimStart().startsWith('#'))continue;
  const match=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);if(!match)throw new Error(`Ligne ${index+1} invalide dans la configuration privée.`);
  if(seen.has(match[1]!))throw new Error(`Variable dupliquée dans le fichier privé: ${match[1]}`);seen.add(match[1]!);
  values[match[1]!]=match[2]!;
 }
}
const env=values;
const cfg={
 NODE_ENV:isProduction?'production':env.NODE_ENV||'development',HOST:env.HOST||'127.0.0.1',PORT:Number(env.PORT||8080),
 PUBLIC_BASE_URL:env.PUBLIC_BASE_URL||env.URL||'http://127.0.0.1:8080',ORIGIN_URL:env.ORIGIN_URL||'http://127.0.0.1:4100',
 TRIAL_SECONDS:Number(env.TRIAL_SECONDS||900),DATABASE_PATH:env.DATABASE_PATH||'./data/alpha-access.sqlite',
 SESSION_SECRET:env.SESSION_SECRET||'',ACTIVATION_HASH_SECRET:env.ACTIVATION_HASH_SECRET||'',
 INITIAL_ADMIN_USERNAME:env.INITIAL_ADMIN_USERNAME||'',INITIAL_ADMIN_PASSWORD:env.INITIAL_ADMIN_PASSWORD||'',
 BUSINESS_NAME:env.BUSINESS_NAME||'ALPHA ACCESS',PAYMENT_CONTACT_LABEL:env.PAYMENT_CONTACT_LABEL||'Contacter notre équipe',
 PAYMENT_CONTACT_URL:env.PAYMENT_CONTACT_URL||'https://example.invalid/contact',
};
if(!['development','test','production'].includes(cfg.NODE_ENV))throw new Error('NODE_ENV invalide.');
if(!Number.isInteger(cfg.PORT)||cfg.PORT<1||cfg.PORT>65535||cfg.TRIAL_SECONDS!==900)throw new Error('PORT/TRIAL_SECONDS invalide (essai fixé à 900 secondes).');
for(const k of ['SESSION_SECRET','ACTIVATION_HASH_SECRET'] as const)if(cfg[k].length<32||/REMPLACER|EXAMPLE/i.test(cfg[k]))throw new Error(`${k} doit être remplacé par un secret aléatoire d’au moins 32 caractères.`);
if(Boolean(cfg.INITIAL_ADMIN_USERNAME)!==Boolean(cfg.INITIAL_ADMIN_PASSWORD))throw new Error('INITIAL_ADMIN_USERNAME et INITIAL_ADMIN_PASSWORD doivent être fournis ensemble.');
if(cfg.INITIAL_ADMIN_USERNAME&&(!/^[A-Za-z0-9_.-]{3,64}$/.test(cfg.INITIAL_ADMIN_USERNAME)||cfg.INITIAL_ADMIN_PASSWORD.length<14))throw new Error('Compte initial non conforme: identifiant invalide ou mot de passe de moins de 14 caractères.');
for(const k of ['PUBLIC_BASE_URL','ORIGIN_URL','PAYMENT_CONTACT_URL'] as const)if(!URL.canParse(cfg[k]))throw new Error(`${k} invalide.`);
const origin=new URL(cfg.ORIGIN_URL),publicBase=new URL(cfg.PUBLIC_BASE_URL);
const paymentContact=new URL(cfg.PAYMENT_CONTACT_URL);
if(cfg.NODE_ENV!=='production'&&(origin.hostname!=='127.0.0.1'||origin.port!=='4100'||origin.protocol!=='http:'))throw new Error('En développement, seule la cible fictive http://127.0.0.1:4100 est autorisée.');
if(cfg.NODE_ENV==='production'){
 if(!isNetlify&&(!externalConfig||env.ALPHA_PRODUCTION_PREFLIGHT!=='verified'))throw new Error('La production Windows doit être démarrée par le script de pré-vérification.');
 if(origin.protocol!=='https:'||publicBase.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/'||publicBase.username||publicBase.password||publicBase.search||publicBase.hash||publicBase.pathname!=='/')throw new Error('Production exige une configuration externe, une origine HTTPS sans identifiant ni chemin, et une URL publique HTTPS.');
 if(!isNetlify&&!['127.0.0.1','::1'].includes(cfg.HOST))throw new Error('Le service Windows de production doit écouter uniquement sur loopback derrière un frontal TLS.');
 if(paymentContact.protocol!=='https:'||paymentContact.username||paymentContact.password)throw new Error('Production exige un lien de contact HTTPS sans identifiants intégrés.');
 if(!isNetlify){
  if(!path.isAbsolute(cfg.DATABASE_PATH))throw new Error('DATABASE_PATH production doit être absolu et externe au projet.');
  const expectedDb=path.resolve(path.dirname(envPath),'data','alpha-access.sqlite');if(path.resolve(cfg.DATABASE_PATH)!==expectedDb)throw new Error('La base de production doit rester dans le dossier privé dédié.');
  const dbRel=path.relative(root,path.resolve(cfg.DATABASE_PATH));if(!dbRel||(!dbRel.startsWith('..'+path.sep)&&dbRel!=='..'&&!path.isAbsolute(dbRel)))throw new Error('La base de production doit rester hors du projet.');
 }
}
export const config={...cfg,DATABASE_PATH:path.resolve(cfg.DATABASE_PATH),PUBLIC_ORIGIN:publicBase.origin,PRIVATE_CONFIG_PATH:externalConfig&&!isNetlify?envPath:null,PROJECT_ROOT:root,isProd:cfg.NODE_ENV==='production',isNetlify};

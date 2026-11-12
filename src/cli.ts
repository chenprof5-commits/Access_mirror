import crypto from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { db, migrate, nowIso } from './db.ts';

const command=process.argv[2];
async function hiddenPassword():Promise<string>{
 if(!stdin.isTTY){const rl=createInterface({input:stdin,output:stdout});try{return await rl.question('Mot de passe (minimum 14 caractères): ');}finally{rl.close();}}
 stdout.write('Mot de passe (minimum 14 caractères): ');stdin.setRawMode(true);stdin.resume();let value='';
 try {return await new Promise<string>((resolve,reject)=>{const onData=(chunk:Buffer)=>{for(const char of chunk.toString('utf8')){if(char==='\r'||char==='\n'){stdin.off('data',onData);stdout.write('\n');resolve(value);return;}if(char==='\u0003'){stdin.off('data',onData);stdout.write('\n');reject(new Error('Annulé.'));return;}if(char==='\u007f'||char==='\b')value=value.slice(0,-1);else value+=char;}};stdin.on('data',onData);});}
 finally {stdin.setRawMode(false);stdin.pause();}
}
if(command==='migrate'){await migrate();console.log('Migrations SQLite appliquées.');}
else if(command==='admin:create'){
 await migrate();const rl=createInterface({input:stdin,output:stdout});
 try{const username=(await rl.question('Identifiant administrateur: ')).trim();rl.close();const password=await hiddenPassword();if(!/^[A-Za-z0-9_.-]{3,64}$/.test(username)||password.length<14)throw new Error('Identifiant ou mot de passe non conforme.');const salt=crypto.randomBytes(16).toString('hex'),digest=crypto.scryptSync(password,salt,64).toString('hex');await db.prepare('INSERT INTO admins(username,password_hash,created_at) VALUES(?,?,?)').run(username,`${salt}:${digest}`,nowIso());console.log('Compte administrateur créé.');}finally{rl.close();}
}else {console.error('Usage: npm run db:migrate | npm run admin:create');process.exitCode=2;}

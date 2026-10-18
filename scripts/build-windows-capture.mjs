import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

if (process.platform !== 'win32') { console.log('Helper nativo é compilado no Windows; build da interface continua disponível.'); process.exit(0); }
const framework = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319');
const csc = path.join(framework, 'csc.exe');
if (!existsSync(csc)) throw new Error('Compilador .NET Framework 4.x não encontrado. Ative o .NET Framework fornecido pelo Windows.');
mkdirSync('native/windows/build', { recursive: true });
const references = ['System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll','System.Web.Extensions.dll',...['UIAutomationClient.dll','UIAutomationTypes.dll','WindowsBase.dll'].map(f => path.join(framework,'WPF',f))];
function compile(source, name) {
  const result=spawnSync(csc,['/nologo','/target:exe','/platform:x64','/optimize+',`/out:native/windows/build/${name}.exe`,...references.map(r=>`/reference:${r}`),source],{stdio:'inherit'});
  if(result.error) throw result.error;
  if(result.status!==0)process.exit(result.status ?? 1);
}
compile('native/windows/ClickRecorder.cs','ClickRecorder');
if(process.argv.includes('--fixtures')) compile('tests/windows/CaptureFixture.cs','CaptureFixture');

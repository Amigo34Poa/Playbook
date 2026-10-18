# Playbook Studio

Aplicativo para documentar processos comerciais no Windows 10 e 11 x64. Registra cliques e narração, organiza instruções em português e exporta PDF ou Word com prints destacados. Empresa confidencial; cargos iniciais: SDR, Assistente de Vendas, Vendedor Interno, Supervisor de Vendas e Gerente de Vendas. Sistema de referência: Tecnicon Business Suite (TBS).

## Instalação e uso

Baixe o instalador em [Releases](https://github.com/Amigo34Poa/Playbook/releases). Veja [Primeiro uso](docs/PRIMEIRO-USO.md). O instalador de avaliação ainda não tem assinatura digital de editor.

1. Instale e abra o Playbook Studio. Em **Configurações**, informe sua chave da API OpenAI, salve e teste a conexão. A assinatura do ChatGPT não inclui saldo da API.
2. Escolha o tipo e a cor dos destaques: inteligente, grifo, círculo ou sublinhado. O modo inteligente sublinha botões/menus, grifa campos de edição/seleção e circula outros controles.
3. Crie um procedimento, escolha o cargo e clique em **Gravar processo**. Escolha um monitor ou acompanhe cliques em todos os monitores. Ative narração se desejar transcrição online.
4. Use o TBS normalmente. Cada clique esquerdo ou direito gera uma etapa com print. A captura usa uma imagem recente anterior ao clique para preservar menus que desaparecem. Não registra teclas digitadas.
5. Encerre com **Ctrl + Shift + Enter**. **Ctrl + Shift + Espaço** registra uma captura manual. Se outro programa ocupar os atalhos, retorne à janela e use Encerrar.
6. Confira a proposta de texto, aplique se estiver correta e edite as etapas. Abra um print para trocar o destaque, a cor ou **Ajustar região** arrastando sobre o campo desejado.
7. Importe PDF, DOCX, TXT ou Markdown para comparar/complementar as instruções. Exporte PDF ou Word com os prints associados às etapas.

A edição, captura, importação e exportação são locais e funcionam sem chave. **Todas as funções de IA exigem internet e sua chave OpenAI**, com cobrança por uso. Não há modelos ou motores offline nesta versão.

## Captura e limites

Um observador próprio em C# usa `WH_MOUSE_LL`, UI Automation, captura de tela e consciência de DPI por monitor. Sem hooks de teclado, leitura de ValuePattern/TextPattern ou acesso ao banco de dados do TBS. Não exige administrador; aplicativos elevados, área de trabalho segura, controles personalizados, desktops remotos e alguns componentes do TBS podem impedir identificar o controle ou capturar sua tela.

Quando o Windows fornece o controle, usamos nome, tipo e retângulo real. Caso contrário, marcamos uma região aproximada do clique e indicamos a limitação no editor. É possível ajustar a região manualmente. Não há reconhecimento visual com IA nem garantia de identificação de todo campo do TBS. Teste uma rotina curta no seu ambiente antes de documentar processos extensos.

A imagem anterior ao clique vem de um cache atualizado aproximadamente a cada 140 ms, limitado a 1600 px no maior lado. Eventos muito rápidos podem exigir revisão da imagem; imagens com mais de 1,5 segundo são descartadas com aviso. Até 120 capturas por sessão, 300 por procedimento, 500 etapas e 250 MB por biblioteca. Divida processos extensos. Prints armazenam a tela inteira do monitor clicado: feche dados confidenciais e revise antes de compartilhar. PDFs digitalizados exigem OCR externo.

## IA, chave e dados

- Destino fixo: `https://api.openai.com/v1`. Transcrição: `whisper-1`, português, WAV mono 16 kHz em trechos de cerca de 20 segundos. Texto: `gpt-4.1-mini` ou `gpt-4.1`.
- Transcrição envia áudio. Organização/revisão enviam texto, metadados dos cliques e textos dos arquivos importados. **As imagens não são enviadas à IA.** Os dados transmitidos estão sujeitos às políticas da OpenAI e da conta contratante.
- A chave fica criptografada com Electron `safeStorage` / DPAPI no Windows, vinculada à conta do usuário. Não é devolvida ao renderer, gravada em documentos ou incluída em mensagens de erro. Em Configurações é possível substituí-la ou removê-la; isso não revoga a chave na OpenAI.
- Biblioteca: `%APPDATA%\playbook-studio\workspace.json`, com cópia anterior em `workspace.backup.json`. Configuração online separada: `online-settings.json`. A versão anterior pode usar a mesma pasta.
- Cada trecho WAV é salvo em `audio-recovery` antes de enviar. Falhas de conexão preservam áudio e tempos. A sessão oferece tentar novamente ou salvar WAV; após reiniciar, os arquivos continuam disponíveis em **Dados e recuperação** e podem ser transcritos com outra ferramenta compatível com WAV. Novas tentativas podem cobrar novamente se o serviço tiver processado uma requisição cuja resposta se perdeu.
- A atualização preserva documentos anteriores. Motores/modelos baixados pela versão 0.1 ficam sem uso; não são apagados automaticamente. Você pode removê-los manualmente se não precisar deles, para liberar espaço. Electron continua sendo a maior parte do instalador.

## Desenvolvimento

Node.js 24 LTS e npm. No Windows, o script compila `native/windows/ClickRecorder.cs` com o compilador .NET Framework 4.x fornecido pelo sistema. Não requer download de modelos ou .NET moderno. O Linux permite desenvolver a interface, testar documentos/IA simulada e realizar captura manual; captura global por clique é específica do Windows.

```bash
npm ci
npm run dev
npm run build
npm test
npx playwright install chromium
npm run test:ui
npm run test:desktop
```

Em Linux na nuvem, use os caches graváveis de `/tmp`, o proxy HTTPS existente e TLS padrão; `PLAYBOOK_CHROMIUM_PATH=/usr/bin/chromium` permite usar o Chromium instalado. O teste Electron requer sessão gráfica (Xvfb, quando disponível). Não execute o aplicativo sem sandbox fora de um teste Linux isolado.

Windows:

```powershell
npm run build:native -- --fixtures
npm run test:native
npm run dist:win
```

O teste nativo cria uma janela controlada, move o cursor, aciona um botão por evento real de mouse e verifica UI Automation, retângulo, imagem anterior por pixels, clique direito e drenagem da captura manual ao encerrar. O teste desktop usa microfone sintético e transporte OpenAI simulado, sem cobranças. A chave de teste é fictícia; Linux simula armazenamento seguro somente no processo de teste. A integração com uma conta real e os controles reais do TBS precisam de validação no computador do usuário.

O workflow Windows valida, empacota NSIS e publica tags `v*` como versões de avaliação, com SHA-256. `--publish never` mantém empacotamento separado da publicação.

## Referência REA

O [morluto/rea](https://github.com/morluto/rea) é uma ferramenta de engenharia reversa e análise, não um gravador de passos. Foi usado para analisar as fronteiras Electron do aplicativo. O equivalente ao Gravador de Passos foi implementado com APIs documentadas do Windows; não contém código descompilado do PSR. [Método e evidência](docs/REA.md).

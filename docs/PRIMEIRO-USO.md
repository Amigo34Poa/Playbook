# Playbook Studio 0.2 — primeiro uso

1. Execute `Playbook-Studio-0.2.0-Windows-x64.exe` no Windows 10 ou 11 x64. Se necessário, peça à TI para conferir o SHA-256 do download. Esta versão de avaliação não possui assinatura de editor.
2. Abra **Configurações** e cole sua chave da API OpenAI. Nunca envie a chave pelo chat. Salve e teste a conexão. A API cobra por uso na sua conta, separadamente do ChatGPT.
3. Escolha **Inteligente**, **Grifar**, **Circular** ou **Sublinhar** e a cor do destaque.
4. Crie um procedimento, informe cargo e título e clique em **Gravar processo**. Selecione o monitor ou todos os monitores. Ative a narração para enviar áudio à OpenAI durante a demonstração.
5. Use o TBS normalmente: cliques esquerdos e direitos geram etapas e prints. A janela fica minimizada. Não é necessário parar o mouse por um segundo. O programa não registra o teclado.
6. Encerre com **Ctrl + Shift + Enter**, ou retorne à janela e clique em Encerrar. **Ctrl + Shift + Espaço** faz uma captura manual. Há limite de 120 prints por sessão.
7. Revise o texto e os prints antes de aplicar a proposta da IA. O Windows pode não expor o nome/retângulo de alguns controles do TBS; nesses casos o editor informa que destacou uma região aproximada. Abra o print para trocar o estilo e a cor ou arraste uma nova região em **Ajustar região**.
8. Importe referências PDF/DOCX/TXT/MD e compare com o procedimento. Textos e referências são enviados à OpenAI quando você usa organização/comparação; imagens permanecem locais. PDF digitalizado exige OCR externo.
9. Exporte para PDF ou Word. Somente os prints associados às etapas aparecem no documento.

Sem internet, é possível capturar cliques e editar/exportar documentos. Transcrição, organização e comparação exigem internet. Áudios com falha de envio ficam em **Narração** para tentar novamente/salvar WAV e também na pasta **Dados e recuperação → audio-recovery**. Após fechar o aplicativo, a recuperação é pelos arquivos WAV dessa pasta.

A atualização preserva a biblioteca anterior. Não usa mais whisper.cpp, llama.cpp ou modelos locais. Esses arquivos não são removidos automaticamente do seu disco.

Faça uma demonstração curta no TBS para conferir a identificação dos controles, seus monitores e os atalhos. Aplicativos elevados, controles personalizados ou telas remotas podem limitar a captura. Confira dados pessoais, senhas e informações comerciais antes de compartilhar prints.

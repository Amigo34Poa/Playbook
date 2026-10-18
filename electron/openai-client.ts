// Fixed destination; API keys and provider error bodies never reach the renderer or logs.
export async function openaiRequest(key: string, route: string, init: RequestInit = {}, transport: typeof fetch = fetch): Promise<any> {
  let response: Response;
  try {
    response = await transport(`https://api.openai.com/v1/${route}`, {
      ...init, redirect: 'error', headers: { ...init.headers, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(120000),
    });
  } catch { throw new Error('Não foi possível conectar à OpenAI. Confira a internet e tente novamente.'); }
  if (!response.ok) {
    const explanation = response.status === 401 ? 'Chave inválida ou revogada.' : response.status === 429 ? 'Limite de uso ou saldo da API indisponível.' : response.status === 403 ? 'Acesso ao modelo não permitido.' : `Serviço indisponível (HTTP ${response.status}).`;
    throw new Error(`OpenAI: ${explanation}`);
  }
  try { return await response.json(); } catch { throw new Error('A OpenAI retornou uma resposta inválida.'); }
}

export function transcriptionSegments(data: any, start: number, end: number) {
  if (!data || typeof data.text !== 'string') throw new Error('Resposta de transcrição inválida.');
  const segments = Array.isArray(data.segments) ? data.segments : [{ start: 0, end: end - start, text: data.text }];
  return segments.filter((s: any) => typeof s.text === 'string' && s.text.trim()).map((s: any) => {
    if (!Number.isFinite(s.start) || !Number.isFinite(s.end)) throw new Error('Tempos de transcrição inválidos.');
    const from = Math.min(end, start + Math.max(0, s.start));
    return { start: from, end: Math.max(from, Math.min(end, start + Math.max(0, s.end))), text: s.text.trim() as string };
  });
}

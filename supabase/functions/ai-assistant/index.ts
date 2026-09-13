import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
});

function cleanString(value: unknown, max = 4000) {
  return String(value ?? '').replace(/\u0000/g, '').slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ') || auth.length < 30) return json({ error: 'Autenticação obrigatória.' }, 401);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return json({ error: 'Configuração do Supabase indisponível.' }, 503);
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) return json({ error: 'Sessão inválida ou expirada.' }, 401);

  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) return json({ error: 'A IA ainda não foi configurada no servidor.' }, 503);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido.' }, 400); }

  const question = cleanString(body?.question, 1000).trim();
  const inputDocs = Array.isArray(body?.documents) ? body.documents.slice(0, 3) : [];
  if (!question) return json({ error: 'Pergunta vazia.' }, 400);
  if (!inputDocs.length) return json({ answer: 'Não encontrei documentos relevantes para responder.', document_ids: [], provider: 'Groq', model: 'openai/gpt-oss-20b' });

  const documents = inputDocs.map((d: any) => ({
    id: cleanString(d?.id, 80),
    title: cleanString(d?.title, 120),
    category: cleanString(d?.category, 80),
    issuer: cleanString(d?.issuer, 100),
    documentType: cleanString(d?.documentType, 80),
    issueDate: cleanString(d?.issueDate, 20),
    expiryDate: cleanString(d?.expiryDate, 20),
    amount: cleanString(d?.amount, 40),
    warrantyMonths: Number(d?.warrantyMonths || 0),
    tags: Array.isArray(d?.tags) ? d.tags.slice(0, 8).map((x: unknown) => cleanString(x, 50)) : [],
    notes: cleanString(d?.notes, 500),
    text: cleanString(d?.text, 2800),
  }));

  const userPrompt = `Você é o assistente do MasterSafe, um cofre pessoal de documentos.
Responda em português do Brasil, de forma curta, clara e útil.
Use SOMENTE as informações dos documentos fornecidos abaixo. Se a resposta não estiver nos documentos, diga explicitamente que não encontrou essa informação.
Não invente datas, valores, nomes, números ou obrigações legais.
Não dê diagnóstico médico, parecer jurídico ou recomendação financeira definitiva; quando o documento apenas mencionar algo, descreva o que ele diz.
Nunca peça senhas, códigos de recuperação ou dados bancários.

Retorne APENAS JSON válido no formato:
{"answer":"resposta ao usuário","document_ids":["id1","id2"]}
Use em document_ids somente IDs dos documentos realmente usados na resposta.

PERGUNTA:
${question}

DOCUMENTOS:
${JSON.stringify(documents)}`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('GROQ_MODEL') || 'openai/gpt-oss-20b',
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.2,
        reasoning_effort: 'low',
        reasoning_format: 'hidden',
        max_completion_tokens: 700,
        response_format: { type: 'json_object' },
      }),
    });

    const raw = await response.text();
    if (!response.ok) {
      console.error('Groq error', response.status, raw.slice(0, 1000));
      if (response.status === 429) return json({ error: 'O limite gratuito da IA foi atingido. Tente novamente mais tarde.' }, 429);
      return json({ error: 'A IA está temporariamente indisponível.' }, 502);
    }

    const parsed = JSON.parse(raw);
    const content = parsed?.choices?.[0]?.message?.content;
    if (!content) return json({ error: 'Resposta vazia da IA.' }, 502);

    let out: any;
    try { out = JSON.parse(content); } catch { out = { answer: cleanString(content, 2500), document_ids: [] }; }
    const allowed = new Set(documents.map((d: any) => d.id));
    const ids = Array.isArray(out?.document_ids) ? out.document_ids.filter((id: unknown) => allowed.has(String(id))).slice(0, 3) : [];

    return json({
      answer: cleanString(out?.answer, 2500),
      document_ids: ids,
      provider: 'Groq',
      model: Deno.env.get('GROQ_MODEL') || 'openai/gpt-oss-20b',
    });
  } catch (error) {
    console.error(error);
    return json({ error: 'Falha de conexão com a IA.' }, 502);
  }
});

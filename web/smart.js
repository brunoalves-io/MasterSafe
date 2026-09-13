'use strict';

/* MasterSafe V2 — leitura inteligente local.
   PDFs com texto são lidos via PDF.js; imagens e PDFs escaneados usam Tesseract.js.
   O conteúdo do documento é processado no navegador. Bibliotecas/idioma OCR podem ser
   baixados de CDN no primeiro uso. */

window.CofreSmart = (() => {
  const PDF_SCRIPT = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
  const PDF_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const TESSERACT_SCRIPT = 'https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/tesseract.min.js';
  const loaders = {};

  function loadScript(url, globalName) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    if (loaders[url]) return loaders[url];
    loaders[url] = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      const timer = setTimeout(() => { script.remove(); delete loaders[url]; reject(new Error('Não foi possível baixar o componente de leitura. Verifique a internet.')); }, 12000);
      script.onload = () => { clearTimeout(timer); if (window[globalName]) resolve(window[globalName]); else { delete loaders[url]; reject(new Error('Componente carregado, mas não inicializado.')); } };
      script.onerror = () => { clearTimeout(timer); delete loaders[url]; reject(new Error('Falha ao carregar o componente de leitura. Verifique a internet.')); };
      document.head.appendChild(script);
    });
    return loaders[url];
  }

  const ensurePdf = () => loadScript(PDF_SCRIPT, 'pdfjsLib');
  const ensureTesseract = () => loadScript(TESSERACT_SCRIPT, 'Tesseract');

  const normalize = value => String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();

  const lower = value => normalize(value).toLowerCase();

  const patterns = [
    { type: 'CNH', title: 'CNH', category: 'Pessoais', score: 9, needles: ['carteira nacional de habilitacao', 'permissao para dirigir', 'cnh'] },
    { type: 'RG', title: 'Carteira de Identidade', category: 'Pessoais', score: 8, needles: ['carteira de identidade', 'registro geral', 'rg'] },
    { type: 'Passaporte', title: 'Passaporte', category: 'Pessoais', score: 9, needles: ['passaporte', 'passport', 'republica federativa do brasil'] },
    { type: 'CPF', title: 'CPF', category: 'Pessoais', score: 7, needles: ['cadastro de pessoas fisicas', 'cpf'] },
    { type: 'CRLV', title: 'CRLV', category: 'Veículos', score: 10, needles: ['certificado de registro e licenciamento de veiculo', 'crlv', 'renavam'] },
    { type: 'Seguro auto', title: 'Seguro do veículo', category: 'Veículos', score: 7, needles: ['apolice', 'seguro auto', 'casco', 'veiculo segurado'] },
    { type: 'IPTU', title: 'IPTU', category: 'Casa', score: 8, needles: ['iptu', 'imposto predial e territorial urbano'] },
    { type: 'Contrato de aluguel', title: 'Contrato de aluguel', category: 'Casa', score: 9, needles: ['contrato de locacao', 'locador', 'locatario'] },
    { type: 'Nota fiscal', title: 'Nota fiscal', category: 'Compras & Garantias', score: 9, needles: ['nota fiscal', 'nf-e', 'nfe', 'danfe', 'chave de acesso'] },
    { type: 'Garantia', title: 'Garantia', category: 'Compras & Garantias', score: 8, needles: ['termo de garantia', 'certificado de garantia', 'garantia'] },
    { type: 'Contrato', title: 'Contrato', category: 'Contratos', score: 5, needles: ['contrato', 'contratante', 'contratada'] },
    { type: 'Financiamento', title: 'Financiamento', category: 'Financeiro', score: 8, needles: ['financiamento', 'credito', 'cet', 'custo efetivo total'] },
    { type: 'Boleto', title: 'Boleto', category: 'Financeiro', score: 8, needles: ['boleto', 'linha digitavel', 'beneficiario', 'pagador'] },
    { type: 'Comprovante', title: 'Comprovante', category: 'Financeiro', score: 7, needles: ['comprovante de pagamento', 'comprovante pix', 'comprovante de transferencia'] },
    { type: 'Diploma', title: 'Diploma', category: 'Educação', score: 8, needles: ['diploma', 'grau de', 'concluiu o curso'] },
    { type: 'Certificado', title: 'Certificado', category: 'Educação', score: 6, needles: ['certificado', 'carga horaria', 'conclusao'] },
    { type: 'Exame', title: 'Exame', category: 'Saúde', score: 7, needles: ['resultado de exame', 'laboratorio', 'hemograma', 'laudo'] },
    { type: 'Receita', title: 'Receita médica', category: 'Saúde', score: 7, needles: ['receita medica', 'prescricao', 'crm'] },
    { type: 'Documento de trabalho', title: 'Documento de trabalho', category: 'Trabalho', score: 5, needles: ['contrato de trabalho', 'empregador', 'salario', 'ctps'] }
  ];

  const knownIssuers = [
    ['DETRAN', ['detran', 'departamento estadual de transito']],
    ['Polícia Federal', ['policia federal']],
    ['Receita Federal', ['receita federal']],
    ['Caixa Econômica Federal', ['caixa economica federal']],
    ['Banco do Brasil', ['banco do brasil']],
    ['Itaú', ['itau unibanco', 'banco itau']],
    ['Bradesco', ['bradesco']],
    ['Santander', ['santander']],
    ['Nubank', ['nubank', 'nu pagamentos']],
    ['Correios', ['empresa brasileira de correios', 'correios']]
  ];

  function emit(onProgress, phase, progress, message) {
    if (typeof onProgress === 'function') onProgress({ phase, progress, message });
  }

  async function extractTextFromPdf(file, onProgress) {
    await ensurePdf();
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
    emit(onProgress, 'pdf', 0.08, 'Abrindo PDF...');
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await window.pdfjsLib.getDocument({ data }).promise;
    const maxPages = Math.min(pdf.numPages, 5);
    const chunks = [];
    for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
      emit(onProgress, 'pdf', 0.08 + (pageNo / maxPages) * 0.42, `Lendo página ${pageNo} de ${maxPages}...`);
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      chunks.push(content.items.map(item => item.str).join(' '));
    }
    let text = chunks.join('\n').trim();
    if (normalize(text).length < 70) {
      emit(onProgress, 'ocr', 0.52, 'PDF parece escaneado. Iniciando OCR...');
      const ocrChunks = [];
      const ocrPages = Math.min(pdf.numPages, 2);
      for (let pageNo = 1; pageNo <= ocrPages; pageNo++) {
        const page = await pdf.getPage(pageNo);
        const viewport = page.getViewport({ scale: 1.7 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        await page.render({ canvasContext: ctx, viewport }).promise;
        const part = await ocrSource(canvas, info => {
          const base = 0.54 + ((pageNo - 1) / ocrPages) * 0.36;
          const slice = 0.36 / ocrPages;
          emit(onProgress, 'ocr', base + slice * (info.progress || 0), `OCR da página ${pageNo}: ${info.message || 'lendo...'}`);
        });
        ocrChunks.push(part);
      }
      text = ocrChunks.join('\n').trim();
    }
    return text;
  }

  async function ocrSource(source, onProgress) {
    await ensureTesseract();
    emit(onProgress, 'ocr', 0.03, 'Preparando OCR em português...');
    const worker = await window.Tesseract.createWorker('por', 1, {
      logger: m => {
        if (m && typeof m.progress === 'number') emit(onProgress, 'ocr', m.progress, translateStatus(m.status));
      }
    });
    try {
      const result = await worker.recognize(source);
      return result?.data?.text || '';
    } finally {
      await worker.terminate();
    }
  }

  function translateStatus(status) {
    const map = {
      'loading tesseract core': 'Carregando motor OCR...',
      'initializing tesseract': 'Inicializando OCR...',
      'loading language traineddata': 'Carregando idioma português...',
      'initializing api': 'Preparando leitura...',
      'recognizing text': 'Reconhecendo texto...'
    };
    return map[status] || 'Analisando documento...';
  }

  async function readFile(file, onProgress) {
    if (!file) throw new Error('Selecione um arquivo.');
    const name = file.name.toLowerCase();
    const type = file.type || '';
    emit(onProgress, 'start', 0.01, 'Identificando arquivo...');
    let text = '';
    let method = 'nome do arquivo';

    if (type === 'application/pdf' || name.endsWith('.pdf')) {
      text = await extractTextFromPdf(file, onProgress);
      method = normalize(text).length >= 70 ? 'PDF / OCR local' : 'PDF';
    } else if (type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif|tiff?)$/i.test(name)) {
      text = await ocrSource(file, info => emit(onProgress, 'ocr', 0.08 + (info.progress || 0) * 0.78, info.message));
      method = 'OCR local';
    } else if (type.startsWith('text/') || /\.(txt|csv|json|md)$/i.test(name)) {
      text = await file.text();
      method = 'texto do arquivo';
    }

    emit(onProgress, 'analyze', 0.91, 'Organizando informações...');
    const analysis = analyzeText(`${file.name}\n${text}`, file.name);
    emit(onProgress, 'done', 1, 'Análise concluída.');
    return { text, method, ...analysis };
  }

  function scorePattern(haystack, item) {
    let score = 0;
    const hits = [];
    for (const needle of item.needles) {
      if (haystack.includes(needle)) {
        score += item.score + Math.min(needle.length / 12, 3);
        hits.push(needle);
      }
    }
    return { score, hits };
  }

  function extractDates(text) {
    const original = String(text || '');
    const rx = /\b([0-3]?\d)[\/.-]([01]?\d)[\/.-]((?:19|20)\d{2})\b/g;
    const dates = [];
    let match;
    while ((match = rx.exec(original)) && dates.length < 30) {
      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3]);
      const d = new Date(year, month - 1, day);
      if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) continue;
      const start = Math.max(0, match.index - 65);
      const end = Math.min(original.length, rx.lastIndex + 65);
      dates.push({
        iso: `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,
        context: lower(original.slice(start, end)),
        index: match.index
      });
    }
    return dates;
  }

  function pickDate(dates, kind) {
    const words = kind === 'expiry'
      ? ['validade', 'valido ate', 'vencimento', 'venc', 'expiration', 'expira', 'fim da vigencia']
      : ['emissao', 'expedicao', 'emitido', 'data de emissao', 'data emissao', 'em'] ;
    const scored = dates.map(d => ({ ...d, score: words.reduce((s, w) => s + (d.context.includes(w) ? 3 : 0), 0) }));
    scored.sort((a,b) => b.score - a.score || a.index - b.index);
    if (scored[0]?.score > 0) return scored[0].iso;
    if (kind === 'issue' && dates.length) return dates[0].iso;
    return '';
  }

  function extractIssuer(haystack, rawText) {
    for (const [label, needles] of knownIssuers) if (needles.some(n => haystack.includes(n))) return label;
    const candidates = String(rawText || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean).slice(0, 25);
    const labeled = candidates.find(line => /(?:emissor|emitente|orgao|empresa)\s*[:\-]/i.test(line));
    if (labeled) return labeled.replace(/^.*?[:\-]\s*/, '').trim().slice(0, 100);
    return '';
  }

  function extractMoney(rawText) {
    const values = [...String(rawText || '').matchAll(/R\$\s?([\d.]{1,12},\d{2})/gi)].map(m => m[1]);
    return values[0] ? `R$ ${values[0]}` : '';
  }

  function extractWarrantyMonths(rawText) {
    const t = lower(rawText);
    let m = t.match(/garantia.{0,35}?(\d{1,3})\s*(?:mes|meses)/i);
    if (m) return Number(m[1]);
    m = t.match(/garantia.{0,35}?(\d{1,2})\s*(?:ano|anos)/i);
    if (m) return Number(m[1]) * 12;
    return 0;
  }

  function addMonthsIso(iso, months) {
    if (!iso || !months) return '';
    const [y,m,d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 12);
    const targetMonth = dt.getMonth() + months;
    dt.setMonth(targetMonth);
    if (dt.getDate() !== d) dt.setDate(0);
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  }

  function analyzeText(rawText, fileName = '') {
    const haystack = lower(`${fileName} ${rawText}`);
    const ranked = patterns.map(item => ({ item, ...scorePattern(haystack, item) })).sort((a,b) => b.score - a.score);
    const best = ranked[0];
    const detected = best && best.score > 0 ? best.item : null;
    const dates = extractDates(rawText);
    let expiryDate = pickDate(dates, 'expiry');
    const issueDate = pickDate(dates.filter(d => d.iso !== expiryDate), 'issue');
    const warrantyMonths = extractWarrantyMonths(rawText);
    if (!expiryDate && issueDate && warrantyMonths) expiryDate = addMonthsIso(issueDate, warrantyMonths);
    const issuer = extractIssuer(haystack, rawText);
    const amount = extractMoney(rawText);
    const years = [...new Set(dates.map(d => d.iso.slice(0,4)))];
    const tags = [detected?.type, issuer, ...years].filter(Boolean).slice(0, 6);
    const evidence = best?.hits?.slice(0, 3) || [];
    const confidence = detected ? Math.max(54, Math.min(97, Math.round(52 + best.score * 3.3))) : 35;
    const cleanBase = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    let title = detected?.title || cleanBase || 'Documento';
    if (amount && detected?.type === 'Nota fiscal') title = 'Nota fiscal';
    return {
      title,
      category: detected?.category || 'Outros',
      documentType: detected?.type || 'Documento',
      issuer,
      issueDate,
      expiryDate,
      tags,
      amount,
      warrantyMonths,
      confidence,
      evidence
    };
  }

  function questionAnswer(question, docs) {
    const q = lower(question);
    if (!q) return { text: 'Digite uma pergunta sobre os documentos do seu cofre.', ids: [] };
    const tokens = q.split(/\W+/).filter(t => t.length > 2 && !['qual','quais','onde','esta','estao','meu','minha','meus','minhas','documento','documentos','cofre'].includes(t));
    const ranked = (docs || []).map(doc => {
      const hay = lower([doc.title, doc.category, doc.issuer, doc.documentType, doc.notes, doc.extractedText, ...(doc.tags || [])].filter(Boolean).join(' '));
      const score = tokens.reduce((s,t) => s + (hay.includes(t) ? 2 : 0), 0) + (q.includes('venc') && doc.expiryDate ? 1 : 0);
      return { doc, score };
    }).filter(x => x.score > 0).sort((a,b) => b.score - a.score).slice(0,5);

    if (q.includes('venc') || q.includes('validade') || q.includes('expira')) {
      const nowYear = new Date().getFullYear();
      const subset = (docs || []).filter(d => d.expiryDate && (!q.includes('este ano') || d.expiryDate.startsWith(String(nowYear))))
        .sort((a,b) => a.expiryDate.localeCompare(b.expiryDate));
      if (!subset.length) return { text: 'Não encontrei documentos com vencimento correspondente à pergunta.', ids: [] };
      return { text: `Encontrei ${subset.length} documento(s) com vencimento. O mais próximo é “${subset[0].title}”, em ${formatBr(subset[0].expiryDate)}.`, ids: subset.slice(0,5).map(d => d.id) };
    }

    if (!ranked.length) return { text: 'Não encontrei uma correspondência clara. Tente citar o tipo, empresa, produto ou categoria do documento.', ids: [] };
    if (ranked.length === 1) return { text: `Encontrei “${ranked[0].doc.title}”.`, ids: [ranked[0].doc.id] };
    return { text: `Encontrei ${ranked.length} itens relacionados. O mais provável é “${ranked[0].doc.title}”.`, ids: ranked.map(x => x.doc.id) };
  }

  function formatBr(iso) {
    if (!iso) return '';
    const [y,m,d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  return { readFile, analyzeText, questionAnswer };
})();

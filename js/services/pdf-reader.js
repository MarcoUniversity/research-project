import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs";

export class PdfReader {
  static async read(file, statusEl){
    statusEl.innerHTML='<span style="color:var(--teal)">Extracting text...</span>';
    try{
      const buf=await file.arrayBuffer();
      const pdf=await pdfjsLib.getDocument({data:buf}).promise;
      let out=[];
      for(let p=1;p<=pdf.numPages;p++){
        const page=await pdf.getPage(p);
        const tc=await page.getTextContent();
        out.push(tc.items.map(it=>it.str).join(' '));
      }
      const text=out.join('\n\n').replace(/\s+\n/g,'\n').trim();
      const words=text.split(/\s+/).length;
      statusEl.innerHTML=`<span style="color:var(--green)">✓ ${file.name}</span> — ${pdf.numPages} pages, ~${words} words.`;
      return text;
    }catch(err){
      statusEl.innerHTML=`<span style="color:var(--coral)">Extraction failed: ${err.message}</span>`;
      return null;
    }
  }
}
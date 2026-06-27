export class TextUtil {
  static escapeHtml(s){ return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
  static toParagraphs(t){
    return t.split(/\n{2,}|\n/).filter(p=>p.trim())
      .map(p=>`<p>${TextUtil.escapeHtml(p.trim())}</p>`).join('');
  }
}
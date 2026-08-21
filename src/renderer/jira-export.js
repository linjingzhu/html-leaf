(() => {
  'use strict';

  const esc = value => String(value ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;');

  function plainInline(content = []) {
    return content.map(node => node.type === 'hardBreak' ? '\n' : (node.text || '')).join('');
  }

  function richInline(content = []) {
    return content.map(node => {
      if (node.type === 'hardBreak') return '<br>';
      if (node.type !== 'text') return '';
      let out = esc(node.text);
      for (const mark of node.marks || []) {
        if (mark.type === 'strong') out = `<strong>${out}</strong>`;
        else if (mark.type === 'em') out = `<em>${out}</em>`;
        else if (mark.type === 'strike') out = `<s>${out}</s>`;
        else if (mark.type === 'underline') out = `<u>${out}</u>`;
        else if (mark.type === 'code') out = `<code>${out}</code>`;
        else if (mark.type === 'subsup') out = mark.attrs?.type === 'sub' ? `<sub>${out}</sub>` : `<sup>${out}</sup>`;
        else if (mark.type === 'link') out = `<a href="${esc(mark.attrs?.href || '')}">${out}</a>`;
      }
      return out;
    }).join('');
  }

  function markdownInline(content = []) {
    return content.map(node => {
      if (node.type === 'hardBreak') return '  \n';
      if (node.type !== 'text') return '';
      let out = node.text || '';
      for (const mark of node.marks || []) {
        if (mark.type === 'code') out = `\`${out.replaceAll('`','\\`')}\``;
        else if (mark.type === 'strong') out = `**${out}**`;
        else if (mark.type === 'em') out = `*${out}*`;
        else if (mark.type === 'strike') out = `~~${out}~~`;
        else if (mark.type === 'link') out = `[${out}](${mark.attrs?.href || ''})`;
        else if (mark.type === 'subsup') out = mark.attrs?.type === 'sub' ? `<sub>${out}</sub>` : `<sup>${out}</sup>`;
      }
      return out;
    }).join('');
  }

  function richBlocks(blocks = []) {
    return blocks.map(block => {
      switch (block.type) {
        case 'heading':
          return `<h${Math.min(6, Math.max(1, block.level || 1))}>${richInline(block.content)}</h${Math.min(6, Math.max(1, block.level || 1))}>`;
        case 'paragraph':
          return `<p>${richInline(block.content)}</p>`;
        case 'codeBlock':
          return `<pre><code>${esc(block.text || '')}</code></pre>`;
        case 'rule':
          return '<hr>';
        case 'blockquote':
          return `<blockquote>${richBlocks(block.content)}</blockquote>`;
        case 'panel': {
          const label = esc(String(block.panelType || 'note').toUpperCase());
          return `<blockquote><p><strong>${label}</strong></p>${richBlocks(block.content)}</blockquote>`;
        }
        case 'bulletList':
        case 'orderedList': {
          const tag = block.type === 'orderedList' ? 'ol' : 'ul';
          return `<${tag}>${(block.content || []).map(item => `<li>${richBlocks(item.content)}</li>`).join('')}</${tag}>`;
        }
        case 'table':
          return `<table><tbody>${(block.content || []).map(row =>
            `<tr>${(row.content || []).map(cell => {
              const tag = cell.type === 'tableHeader' ? 'th' : 'td';
              const attrs = `${cell.colspan > 1 ? ` colspan="${cell.colspan}"` : ''}${cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : ''}`;
              return `<${tag}${attrs}>${richBlocks(cell.content)}</${tag}>`;
            }).join('')}</tr>`).join('')}</tbody></table>`;
        default:
          return '';
      }
    }).join('');
  }

  function blockPlainText(block, depth = 0) {
    const indent = '  '.repeat(depth);
    switch (block.type) {
      case 'heading': return `${plainInline(block.content)}\n`;
      case 'paragraph': return `${plainInline(block.content)}\n`;
      case 'codeBlock': return `${block.text || ''}\n`;
      case 'rule': return '--------------------------------\n';
      case 'blockquote':
      case 'panel':
        return (block.content || []).map(b => blockPlainText(b, depth)).join('');
      case 'bulletList':
      case 'orderedList':
        return (block.content || []).map((item, i) => {
          const prefix = block.type === 'orderedList' ? `${i + 1}. ` : '• ';
          const text = (item.content || []).map(b => blockPlainText(b, depth + 1)).join('').trim();
          return `${indent}${prefix}${text}\n`;
        }).join('');
      case 'table':
        return (block.content || []).map(row =>
          (row.content || []).map(cell =>
            (cell.content || []).map(b => blockPlainText(b)).join(' ').replace(/\s+/g,' ').trim()
          ).join(' | ') + '\n'
        ).join('');
      default: return '';
    }
  }

  function toPlainText(doc) {
    return (doc.content || []).map(block => blockPlainText(block)).join('\n').replace(/\n{3,}/g,'\n\n').trim();
  }

  function toRichHtml(doc) {
    return `<div>${richBlocks(doc.content)}</div>`;
  }

  function markdownBlocks(blocks = [], depth = 0) {
    const out = [];
    for (const block of blocks) {
      switch (block.type) {
        case 'heading':
          out.push(`${'#'.repeat(Math.min(6,Math.max(1,block.level||1)))} ${markdownInline(block.content)}`);
          break;
        case 'paragraph':
          out.push(markdownInline(block.content));
          break;
        case 'codeBlock':
          out.push(`\`\`\`\n${block.text || ''}\n\`\`\``);
          break;
        case 'rule':
          out.push('---');
          break;
        case 'blockquote':
          out.push(markdownBlocks(block.content, depth).split('\n').map(line => `> ${line}`).join('\n'));
          break;
        case 'panel': {
          const body = markdownBlocks(block.content, depth);
          out.push(`> **${String(block.panelType || 'note').toUpperCase()}**\n> \n${body.split('\n').map(line => `> ${line}`).join('\n')}`);
          break;
        }
        case 'bulletList':
        case 'orderedList':
          (block.content || []).forEach((item, i) => {
            const prefix = block.type === 'orderedList' ? `${i+1}.` : '-';
            const body = markdownBlocks(item.content || [], depth + 1).trim();
            const lines = body.split('\n');
            out.push(`${'  '.repeat(depth)}${prefix} ${lines[0] || ''}`);
            lines.slice(1).forEach(line => out.push(`${'  '.repeat(depth + 1)}${line}`));
          });
          break;
        case 'table': {
          const rows = (block.content || []).map(row =>
            (row.content || []).map(cell =>
              (cell.content || []).map(b => blockPlainText(b)).join(' ').replace(/\s+/g,' ').trim().replaceAll('|','\\|')
            )
          );
          if (rows.length) {
            const colCount = Math.max(...rows.map(r => r.length));
            const header = rows[0];
            out.push(`| ${Array.from({length:colCount},(_,i)=>header[i]||'').join(' | ')} |`);
            out.push(`| ${Array.from({length:colCount},()=> '---').join(' | ')} |`);
            rows.slice(1).forEach(row => out.push(`| ${Array.from({length:colCount},(_,i)=>row[i]||'').join(' | ')} |`));
          }
          break;
        }
      }
      if (block.type !== 'bulletList' && block.type !== 'orderedList') out.push('');
    }
    return out.join('\n').replace(/\n{3,}/g,'\n\n').trim();
  }

  function toMarkdown(doc) {
    return markdownBlocks(doc.content || []);
  }

  function adfMarks(marks = []) {
    return marks.map(mark => {
      if (['strong','em','strike','underline','code'].includes(mark.type)) return { type: mark.type };
      if (mark.type === 'subsup') return { type: 'subsup', attrs: { type: mark.attrs?.type === 'sub' ? 'sub' : 'sup' } };
      if (mark.type === 'link' && mark.attrs?.href) {
        return {
          type: 'link',
          attrs: {
            href: mark.attrs.href,
            ...(mark.attrs.title ? { title: mark.attrs.title } : {})
          }
        };
      }
      return null;
    }).filter(Boolean);
  }

  function adfInline(content = []) {
    return content.map(node => {
      if (node.type === 'hardBreak') return { type: 'hardBreak' };
      if (node.type !== 'text' || !node.text) return null;
      const marks = adfMarks(node.marks || []);
      return {
        type: 'text',
        text: node.text,
        ...(marks.length ? { marks } : {})
      };
    }).filter(Boolean);
  }

  function ensureParagraphContent(content) {
    return content?.length ? content : [];
  }

  function panelSafeBlocks(blocks = []) {
    const allowed = new Set(['paragraph','heading','bulletList','orderedList']);
    const output = [];
    for (const block of blocks) {
      if (allowed.has(block.type)) output.push(block);
      else if (block.type === 'codeBlock') {
        output.push({
          type: 'paragraph',
          content: [{ type: 'text', text: block.text || '', marks: [{ type: 'code' }] }]
        });
      } else {
        const text = blockPlainText(block).trim();
        if (text) output.push({ type: 'paragraph', content: [{ type: 'text', text }] });
      }
    }
    return output.length ? output : [{ type: 'paragraph', content: [] }];
  }

  function toAdfBlock(block) {
    switch (block.type) {
      case 'heading':
        return {
          type: 'heading',
          attrs: { level: Math.min(6, Math.max(1, block.level || 1)) },
          content: adfInline(block.content)
        };
      case 'paragraph': {
        const content = adfInline(block.content);
        return { type: 'paragraph', ...(content.length ? { content } : {}) };
      }
      case 'codeBlock':
        return {
          type: 'codeBlock',
          attrs: { wrap: true },
          content: block.text ? [{ type: 'text', text: block.text }] : []
        };
      case 'rule':
        return { type: 'rule' };
      case 'blockquote':
        return {
          type: 'blockquote',
          content: (block.content || []).map(toAdfBlock).filter(Boolean)
        };
      case 'panel':
        return {
          type: 'panel',
          attrs: { panelType: ['info','note','warning','success','error'].includes(block.panelType) ? block.panelType : 'note' },
          content: panelSafeBlocks(block.content).map(toAdfBlock).filter(Boolean)
        };
      case 'bulletList':
      case 'orderedList':
        return {
          type: block.type,
          content: (block.content || []).map(item => ({
            type: 'listItem',
            content: (item.content || []).map(toAdfBlock).filter(Boolean)
          }))
        };
      case 'table':
        return {
          type: 'table',
          attrs: {
            isNumberColumnEnabled: false,
            layout: 'default',
            displayMode: 'default'
          },
          content: (block.content || []).map(row => ({
            type: 'tableRow',
            content: (row.content || []).map(cell => {
              const attrs = {};
              if (cell.colspan > 1) attrs.colspan = cell.colspan;
              if (cell.rowspan > 1) attrs.rowspan = cell.rowspan;
              const content = (cell.content || []).map(toAdfBlock).filter(Boolean);
              return {
                type: cell.type === 'tableHeader' ? 'tableHeader' : 'tableCell',
                ...(Object.keys(attrs).length ? { attrs } : {}),
                content: content.length ? content : [{ type: 'paragraph' }]
              };
            })
          }))
        };
      default:
        return null;
    }
  }

  function toAdf(doc) {
    return {
      version: 1,
      type: 'doc',
      content: (doc.content || []).map(toAdfBlock).filter(Boolean)
    };
  }

  function safePreviewHref(value) {
    const href=String(value||'').trim();
    if(!href)return null;
    if(href.startsWith('#'))return href;
    try{
      const url=new URL(href);
      return ['http:','https:','mailto:'].includes(url.protocol)?url.href:null;
    }catch{return null;}
  }

  function markdownInlineToRich(value) {
    const tokens=[];
    const token=html=>{const id=`\u0000MD${tokens.length}\u0000`;tokens.push(html);return id;};
    let source=String(value||'');
    source=source.replace(/`([^`]+)`/g,(_all,text)=>token(`<code>${esc(text)}</code>`));
    source=source.replace(/\[([^\]]+)\]\(([^)]+)\)/g,(_all,label,href)=>{
      const safe=safePreviewHref(href);
      return token(safe?`<a href="${esc(safe)}">${esc(label)}</a>`:esc(label));
    });
    let out=esc(source)
      .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
      .replace(/__([^_]+)__/g,'<strong>$1</strong>')
      .replace(/~~([^~]+)~~/g,'<s>$1</s>')
      .replace(/(^|[^*])\*([^*]+)\*/g,'$1<em>$2</em>')
      .replace(/(^|[^_])_([^_]+)_/g,'$1<em>$2</em>');
    tokens.forEach((html,index)=>{out=out.replaceAll(`\u0000MD${index}\u0000`,html);});
    return out;
  }

  function markdownToRichHtml(markdown) {
    const lines=String(markdown||'').replace(/\r\n?/g,'\n').split('\n');
    const out=[];
    let listType=null;
    let inCode=false;
    let code=[];
    const closeList=()=>{if(listType){out.push(`</${listType}>`);listType=null;}};
    for(const line of lines){
      if(/^\s*```/.test(line)){
        closeList();
        if(inCode){out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);code=[];inCode=false;}
        else inCode=true;
        continue;
      }
      if(inCode){code.push(line);continue;}
      const heading=line.match(/^\s*(#{1,6})\s+(.+)$/);
      if(heading){closeList();const level=heading[1].length;out.push(`<h${level}>${markdownInlineToRich(heading[2])}</h${level}>`);continue;}
      if(/^\s*(---+|___+|\*\*\*+)\s*$/.test(line)){closeList();out.push('<hr>');continue;}
      const bullet=line.match(/^\s*[-*+]\s+(.+)$/);
      const ordered=line.match(/^\s*\d+[.)]\s+(.+)$/);
      if(bullet||ordered){const nextType=ordered?'ol':'ul';if(listType!==nextType){closeList();listType=nextType;out.push(`<${listType}>`);}out.push(`<li>${markdownInlineToRich((bullet||ordered)[1])}</li>`);continue;}
      closeList();
      const quote=line.match(/^\s*>\s?(.*)$/);
      if(quote){out.push(`<blockquote><p>${markdownInlineToRich(quote[1])}</p></blockquote>`);continue;}
      if(!line.trim()){out.push('');continue;}
      out.push(`<p>${markdownInlineToRich(line.trim())}</p>`);
    }
    closeList();
    if(inCode)out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
    return `<div>${out.join('')}</div>`;
  }

  function adfMarksToRich(text,marks=[]) {
    let out=esc(text||'');
    for(const mark of marks){
      if(mark.type==='strong')out=`<strong>${out}</strong>`;
      else if(mark.type==='em')out=`<em>${out}</em>`;
      else if(mark.type==='strike')out=`<s>${out}</s>`;
      else if(mark.type==='underline')out=`<u>${out}</u>`;
      else if(mark.type==='code')out=`<code>${out}</code>`;
      else if(mark.type==='subsup')out=mark.attrs?.type==='sub'?`<sub>${out}</sub>`:`<sup>${out}</sup>`;
      else if(mark.type==='link'){
        const href=safePreviewHref(mark.attrs?.href);
        if(href)out=`<a href="${esc(href)}">${out}</a>`;
      }
    }
    return out;
  }

  function adfNodeToRich(node) {
    if(!node||typeof node!=='object')return '';
    const children=()=>Array.isArray(node.content)?node.content.map(adfNodeToRich).join(''):'';
    switch(node.type){
      case 'doc':return `<div>${children()}</div>`;
      case 'text':return adfMarksToRich(node.text,node.marks);
      case 'hardBreak':return '<br>';
      case 'paragraph':return `<p>${children()}</p>`;
      case 'heading':{const level=Math.min(6,Math.max(1,Number(node.attrs?.level)||1));return `<h${level}>${children()}</h${level}>`;}
      case 'rule':return '<hr>';
      case 'blockquote':return `<blockquote>${children()}</blockquote>`;
      case 'panel':return `<blockquote data-panel="${esc(node.attrs?.panelType||'note')}">${children()}</blockquote>`;
      case 'bulletList':return `<ul>${children()}</ul>`;
      case 'orderedList':return `<ol>${children()}</ol>`;
      case 'listItem':return `<li>${children()}</li>`;
      case 'codeBlock':return `<pre><code>${esc((node.content||[]).map(item=>item.text||'').join(''))}</code></pre>`;
      case 'table':return `<table><tbody>${children()}</tbody></table>`;
      case 'tableRow':return `<tr>${children()}</tr>`;
      case 'tableHeader':return `<th${node.attrs?.colspan>1?` colspan="${Number(node.attrs.colspan)}"`:''}>${children()}</th>`;
      case 'tableCell':return `<td${node.attrs?.colspan>1?` colspan="${Number(node.attrs.colspan)}"`:''}>${children()}</td>`;
      case 'mention':return `<span class="mention">@${esc(node.attrs?.text||node.attrs?.displayName||'user')}</span>`;
      case 'emoji':return esc(node.attrs?.text||node.attrs?.shortName||'');
      case 'status':return `<span class="status">${esc(node.attrs?.text||'')}</span>`;
      case 'inlineCard':case 'blockCard':return `<a href="${esc(safePreviewHref(node.attrs?.url)||'#')}">${esc(node.attrs?.url||'Link')}</a>`;
      default:return children();
    }
  }

  function adfToRichHtml(input) {
    const doc=input?.type==='doc'?input:(input?.fields?.description||input?.description||input);
    if(!doc||doc.type!=='doc'||!Array.isArray(doc.content))throw new Error('JSON does not contain an ADF document or Jira fields.description.');
    return adfNodeToRich(doc);
  }

  function stats(doc) {
    const counts = {};
    const walk = blocks => {
      (blocks || []).forEach(block => {
        counts[block.type] = (counts[block.type] || 0) + 1;
        if (block.content && ['blockquote','panel'].includes(block.type)) walk(block.content);
        if (['bulletList','orderedList'].includes(block.type)) {
          block.content.forEach(item => walk(item.content));
        }
      });
    };
    walk(doc.content);
    return counts;
  }

  window.JiraExport = {
    toPlainText,
    toRichHtml,
    toMarkdown,
    toAdf,
    markdownToRichHtml,
    adfToRichHtml,
    stats
  };
})();

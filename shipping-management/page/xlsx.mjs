// Dependency-free reader for unencrypted .xlsx. No macros, formulas or links execute.
// Uses the ZIP central directory, bounded inflation and namespace-aware XML.
const decoder=new TextDecoder();
const fail=message=>{throw new Error(message);};
const nodes=(root,name)=>[...root.getElementsByTagNameNS('*',name)];
function xml(text){if(/<!DOCTYPE|<!ENTITY/i.test(text))fail('Excel XML 不支持实体声明');const doc=new DOMParser().parseFromString(text,'application/xml');if(nodes(doc,'parsererror').length)fail('Excel XML 无效');return doc;}
function column(ref){const letters=ref.match(/^[A-Z]+/)?.[0];if(!letters)fail('Excel 单元格地址无效');return [...letters].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;}
async function unzip(buffer){
  if(buffer.byteLength>10*1024*1024)fail('Excel 文件最大10MB');
  const bytes=new Uint8Array(buffer),view=new DataView(buffer);let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===bytes.length){end=i;break;}
  if(end<0)fail('不是有效的xlsx文件，请使用Excel另存为 .xlsx');
  if(view.getUint16(end+4,true)||view.getUint16(end+6,true))fail('不支持分卷Excel');
  const count=view.getUint16(end+10,true);let pos=view.getUint32(end+16,true),total=0;const entries=new Map();
  if(count>500)fail('Excel 文件内容过多，请精简后导入');
  for(let i=0;i<count;i++){
    if(pos+46>bytes.length||view.getUint32(pos,true)!==0x02014b50)fail('Excel ZIP 目录损坏');
    const flags=view.getUint16(pos+8,true),method=view.getUint16(pos+10,true),size=view.getUint32(pos+20,true),raw=view.getUint32(pos+24,true),nameLen=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true),offset=view.getUint32(pos+42,true);
    total+=raw;if(total>32*1024*1024||raw>16*1024*1024)fail('Excel 解压内容过大');
    const name=decoder.decode(bytes.slice(pos+46,pos+46+nameLen));
    if(name.includes('..')||name.startsWith('/')||entries.has(name)||flags&1)fail('Excel 路径异常或文件已加密');
    entries.set(name,{method,size,raw,offset});pos+=46+nameLen+extra+comment;
  }
  return async name=>{
    const e=entries.get(name);if(!e)fail('Excel 缺少内容：'+name);const at=e.offset;
    if(at+30>bytes.length||view.getUint32(at,true)!==0x04034b50)fail('Excel 文件损坏');
    const start=at+30+view.getUint16(at+26,true)+view.getUint16(at+28,true);if(start+e.size>bytes.length)fail('Excel 数据超出文件范围');
    const compressed=bytes.slice(start,start+e.size);let output;
    if(e.method===0)output=compressed;
    else if(e.method===8){
      if(typeof DecompressionStream==='undefined')fail('浏览器不支持Excel解压，请更新浏览器或使用CSV');
      const reader=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();const chunks=[];let length=0;
      for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>e.raw||length>16*1024*1024){await reader.cancel();fail('Excel 解压大小异常');}chunks.push(value);}
      output=new Uint8Array(length);let offset=0;for(const part of chunks){output.set(part,offset);offset+=part.length;}
    }else fail('Excel 压缩方式不支持');
    if(output.length!==e.raw)fail('Excel 文件长度异常');return decoder.decode(output);
  };
}
export async function readXlsx(buffer){
  const get=await unzip(buffer),workbook=xml(await get('xl/workbook.xml')),relationships=xml(await get('xl/_rels/workbook.xml.rels'));
  const relation=new Map(nodes(relationships,'Relationship').filter(r=>r.getAttribute('TargetMode')!=='External').map(r=>[r.getAttribute('Id'),r.getAttribute('Target')]));
  let strings=[];try{const doc=xml(await get('xl/sharedStrings.xml'));strings=nodes(doc,'si').map(si=>nodes(si,'t').map(t=>t.textContent).join(''));}catch(e){if(!e.message.startsWith('Excel 缺少内容'))throw e;}
  let styles=[];try{const doc=xml(await get('xl/styles.xml')),custom=new Map(nodes(doc,'numFmt').map(n=>[Number(n.getAttribute('numFmtId')),n.getAttribute('formatCode')]));const xfs=nodes(doc,'cellXfs')[0];styles=xfs?[...xfs.children].map(n=>{const id=Number(n.getAttribute('numFmtId'));return custom.get(id)||(id===1?'0':'');}):[];}catch(e){if(!e.message.startsWith('Excel 缺少内容'))throw e;}
  return nodes(workbook,'sheet').filter(s=>s.getAttribute('state')!=='hidden'&&s.getAttribute('state')!=='veryHidden').map(sheet=>({name:sheet.getAttribute('name'),async rows(){
    const id=sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'),target=relation.get(id);if(!target)fail('Excel 工作表关系无效');
    const path=target.startsWith('/')?target.slice(1):'xl/'+target;if(path.includes('..'))fail('Excel 工作表路径无效');
    const doc=xml(await get(path)),rows=[];let cells=0;
    for(const row of nodes(doc,'row')){
      const n=Number(row.getAttribute('r'));if(!Number.isSafeInteger(n)||n<1||n>5001)fail('表头须在第一行，每张表最多5000行数据');
      const values=[];for(const c of nodes(row,'c')){
        if(++cells>100000)fail('Excel 单元格过多');const col=column(c.getAttribute('r')||'');if(col>100)fail('Excel 列数过多，请仅保留导入需要的列');
        if(nodes(c,'f').length)fail('Excel 第'+n+'行含公式，请将公式粘贴为值后导入');
        const type=c.getAttribute('t'),raw=nodes(c,'v')[0]?.textContent||'';let value=type==='s'?strings[Number(raw)]:type==='inlineStr'?nodes(c,'t').map(t=>t.textContent).join(''):raw;
        if(type==='e')fail('Excel 第'+n+'行含错误单元格');if(value===undefined)fail('Excel 文本索引无效');
        const format=styles[Number(c.getAttribute('s')||0)]||'';if(type!=='s'&&type!=='inlineStr'&&/^0+$/.test(format)&&/^\d+$/.test(value))value=value.padStart(format.length,'0');
        values[col]=value;
      }
      while(rows.length<n)rows.push([]);rows[n-1]=Array.from({length:values.length},(_,i)=>values[i]??'');
    }
    return rows;
  }}));
}

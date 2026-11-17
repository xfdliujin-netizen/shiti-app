const allowedTopics=new Set(['integer','unit-rate','area','perimeter','mass','distance','decimal','remainder','average','inverse']);
export async function bankRead(url,db){
  const p=url.searchParams;
  if(url.pathname==='/api/bank/items'){
    const ids=[...new Set((p.get('ids')||'').split(','))];
    if(!ids.length||ids.length>10||ids.some(id=>!/^cmath-dev-\d{4}$/.test(id)))return {status:400,body:{error:'每次最多读取10道指定题目'}};
    const rows=await db.prepare(`SELECT payload FROM bank_questions WHERE review_status='checked' AND id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all();
    return {status:200,body:{items:rows.results.map(r=>JSON.parse(r.payload))}};
  }
  if(url.pathname==='/api/bank/item'){
    const id=p.get('id')||'';if(!/^cmath-dev-\d{4}$/.test(id))return {status:400,body:{error:'题库编号无效'}};
    const row=await db.prepare("SELECT payload FROM bank_questions WHERE id=? AND review_status='checked'").bind(id).first();
    return row?{status:200,body:{item:JSON.parse(row.payload)}}:{status:404,body:{error:'题目不存在或尚未核对'}};
  }
  const subject=p.get('subject')||'数学',grade=Number(p.get('grade')||4),difficulty=Number(p.get('difficulty')||0),limit=Number(p.get('limit')||20),topic=p.get('topic')||'',after=p.get('after')||'';
  const learned=(p.get('learned')||'').split(',').filter(Boolean);
  if(subject!=='数学'||!Number.isInteger(grade)||grade<1||grade>12||!Number.isInteger(difficulty)||difficulty<0||difficulty>3||!Number.isInteger(limit)||limit<1||limit>20||topic&&!allowedTopics.has(topic)||learned.length>10||learned.some(t=>!allowedTopics.has(t))||after&&!/^cmath-dev-\d{4}$/.test(after))return {status:400,body:{error:'题库筛选参数无效'}};
  const gradeClause=learned.length?`(grade<=? OR knowledge_id IN (${learned.map(()=>'?').join(',')}))`:'grade<=?';
  const where=["subject=?","review_status='checked'",gradeClause],args=[subject,grade,...learned];
  if(topic){where.push('knowledge_id=?');args.push(topic)}
  if(difficulty){where.push('difficulty=?');args.push(difficulty)}
  if(after){where.push('id>?');args.push(after)}
  const rows=await db.prepare('SELECT payload FROM bank_questions WHERE '+where.join(' AND ')+' ORDER BY id LIMIT ?').bind(...args,limit+1).all();
  const items=rows.results.slice(0,limit).map(row=>{const q=JSON.parse(row.payload);const {answer,analysis,numericAnswer,proof,...publicFields}=q;return publicFields});
  return {status:200,body:{items,more:rows.results.length>limit,cursor:items.at(-1)?.id||after}};
}

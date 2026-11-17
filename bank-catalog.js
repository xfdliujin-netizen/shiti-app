const BANK_TOPICS=Object.freeze([
  {id:'integer',label:'整数四则应用',minGrade:3,prerequisites:[],methods:['arithmetic']},
  {id:'unit-rate',label:'归一与平均分',minGrade:3,prerequisites:['integer'],methods:['arithmetic']},
  {id:'area',label:'长方形与正方形面积',minGrade:3,prerequisites:['integer'],methods:['arithmetic']},
  {id:'perimeter',label:'长方形与正方形周长',minGrade:3,prerequisites:['integer'],methods:['arithmetic']},
  {id:'mass',label:'质量单位换算',minGrade:3,prerequisites:['integer'],methods:['arithmetic']},
  {id:'distance',label:'路程、速度与时间',minGrade:4,prerequisites:['unit-rate'],methods:['arithmetic']},
  {id:'decimal',label:'小数加减应用',minGrade:4,prerequisites:['integer'],methods:['arithmetic','decimal']},
  {id:'remainder',label:'有余数的实际问题',minGrade:3,prerequisites:['unit-rate'],methods:['arithmetic']},
  {id:'average',label:'平均数',minGrade:4,prerequisites:['unit-rate'],methods:['arithmetic']},
  {id:'inverse',label:'逆向还原',minGrade:4,prerequisites:['integer'],methods:['arithmetic']}
]);
const BANK_METHODS=Object.freeze([
  {id:'arithmetic',label:'整数四则运算',minGrade:1},
  {id:'decimal',label:'小数运算',minGrade:4},
  {id:'fraction',label:'分数运算',minGrade:5},
  {id:'equation',label:'用方程解题',minGrade:6}
]);

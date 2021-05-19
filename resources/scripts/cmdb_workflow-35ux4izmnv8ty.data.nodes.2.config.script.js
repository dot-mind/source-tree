// WorkflowRuntimeContext 类型对象暴露 workflow 运行时方法
var ctx = new WorkflowRuntimeContext()
var input = ctx.input() // 获取input数据

var schema = input.schema;
var vars_map = input.vars_map;

function main () {
  if (schema) {
    var newSchema = JSON.parse(schema);
    var properties = newSchema.properties;

    for (var i in vars_map) {
      for (var j in properties) {
        if (j.indexOf(i) > -1) {
          properties[j].default = vars_map[i];
          properties[j]["ui:readonly"] = true;
        }
      }
    }

    newSchema.properties = properties;
    schema = JSON.stringify(newSchema);
  }

  return {
    result: "SUCCEEDED",
    result_name: "获取schema成功",
    message: "获取schema成功",
    output: schema
  };
}

try {
  var output = main();
  ctx.output(output);
} catch (err) {
  ctx.output({
    result: "FAILED",
    result_name: "获取schema失败",
    message: "获取schema失败：" + err,
    output: schema
  })
}
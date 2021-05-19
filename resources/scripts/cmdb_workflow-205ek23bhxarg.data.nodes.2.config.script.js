// WorkflowRuntimeContext 类型对象暴露 workflow 运行时方法
var ctx = new WorkflowRuntimeContext()
var input = ctx.input() // 获取input数据
// ctx.output({xxxx}) 输出

function main() {
    var res = ctx.ecu.ql.queryQlTable({
        "function": "db",
        "objects": [input.id],
        "selects": ["."]
    })
    if (res.row_count === 1) {
        var obj = res.rows[0].data[1];
        var target = {
            id: obj.inode.id,
        }
        for (var key in obj.inode) {
            target[".inode." + key] = obj.inode[key];
        }
        if (obj.data) {
            for (var key in obj.data) {
                target[".data." + key] = obj.data[key];
            }
        }
        if (obj.indexes) {
            for (var key in obj.indexes) {
                target[".indexes." + key] = obj.indexes[key];
            }
        }
        return target;
    }
    return null
}

try {
    var output = main();
    if (!output) {
        ctx.output({
            "result": "FAILED",
            "result_name": "查询失败",
            "message": "未找到对象"
        });
    } 

    ctx.output({
        "result": "SUCCEEDED",
        "result_name": "查询成功",
        "message": "查询成功",
        "output": output,
    });
}
catch (e) {
    ctx.output({
        "result": "FAILED",
        "result_name": "查询失败",
        "message": e.message
    });
}
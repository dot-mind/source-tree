
var ctx = new WorkflowRuntimeContext();
var configId = "cmdb_x-2dx55vlrfasbr"
var schemaId = "cmdb_schema_u_tree_config-0"
var input = ctx.input();

function main() {
    var key = input.value.field;
    var conditions = input.conditions
    var ids = input.ids
    var ql_id = input.ql_id
    if (!key) {
        return {
            "result": "FAILED",
            "result_name": "更新失败",
            "message": "未找到更新字段"
        };
    }
    var val = input.value[key];
    var object = {
        "data": {},
        "indexes": {},
        "inode": {}
    }
    if (key.substring(0, 1) === ".") {
        key = key.substring(1);
    }
    var keys = key.split(".");
    if (keys.length) {
        var o = object[keys[0]];
        for (var i = 1; i < keys.length - 1; i++) {
            o = o[keys[i]] || (o[keys[i]] = {});
        }
        o[keys[keys.length - 1]] = val;
    }
    var content = ""
    if (input.ids[0] !== "$conditions") {
        result = ctx.ecu.cmdb.updateObjects(
            {
                "conditions": [
                    {
                        "field": ".inode.id",
                        "op": "=-",
                        "value": ids
                    }
                ],
                "objects": ids
            },
            {
                "object": object,
                "updates": [input.value.field]
            }
        );
    } else {
        objects_ids = []
        var res = ctx.ecu.ql.queryQlTablePack(
            ql_id,
            { "conditions": conditions }
        )
        if (res.rows.length == 0) {
            return
        }
        res.rows.forEach(function (element) {
            var id = element["data"][0]
            objects_ids.push(id)
        });


        result = ctx.ecu.cmdb.updateObjects(
            {
                "objects": objects_ids
            },
            {
                "object": object,
                "updates": [input.value.field]
            }
        );

    }
    if (result.failed_count > 0) {
        return {
            "result": "FAILED",
            "result_name": "更新失败",
            "message": "更新成功" + result.update_count + "条," + "更新失败" + result.failed_count + "条"  
        };
    } else {
        return {
            "result": "SUCCEEDED",
            "result_name": "更新成功",
            "message": "更新成功",
            "content": content,
            "output": result
        };
    }
}
try {
    var output = main();
    ctx.output(output);
}
catch (e) {
    ctx.output({
        "result": "FAILED",
        "result_name": "发生异常",
        "message": e.message
    });
}


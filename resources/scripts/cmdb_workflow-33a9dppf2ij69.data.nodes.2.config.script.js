
var ctx = new WorkflowRuntimeContext()
var configId = "cmdb_x-2dx55vlrfasbr"
var schemaId = "cmdb_schema_u_tree_config-0"
var input = ctx.input()


var ids = input.ids
var ql_id = input.ql_id
var conditions = input.conditions

function main() {
    var result = {}
    if (ids[0] == "$conditions") {
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
                "conditions": [
                    {
                        "field": ".inode.id",
                        "op": "=-",
                        "value": objects_ids
                    },
                    {
                        "field": ".inode.schema_id",
                        "op": "=",
                        "value": schemaId
                    }
                ],
                "objects": objects_ids
            },
            {
                "object": {
                    "inode": {
                        "archived": true
                    }
                },
                "updates": [".inode.archived"]
            }
        );
    } else {
        result = ctx.ecu.cmdb.updateObjects(
            {
                "conditions": [
                    {
                        "field": ".inode.id",
                        "op": "=-",
                        "value": ids
                    },
                    {
                        "field": ".inode.schema_id",
                        "op": "=",
                        "value": schemaId
                    }
                ],
                "objects": ids
            },
            {
                "object": {
                    "inode": {
                        "archived": true
                    }
                },
                "updates": [".inode.archived"]
            }
        );
    }

    if (result.failed_count > 0) {
        return {
            "result": "FAILED",
            "result_name": "归档失败",
            "message": "归档失败"
        };
    } else {
        return {
            "result": "SUCCEEDED",
            "result_name": "归档成功",
            "message": "归档成功",
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


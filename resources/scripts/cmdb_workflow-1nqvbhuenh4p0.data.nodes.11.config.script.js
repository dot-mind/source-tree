// 更新 ssh 任务的状态和开始时间
var ctx = new WorkflowRuntimeContext()
var input = ctx.input()

var scriptTaskRecordSchema = "cmdb_schema_x-3cu4v1w20seby"

var execStatusRunning = "RUNNING"

function main() {
    var now = new Date().getTime() / 1000;
    var taskRecordQuery = {
        objects: [input.id],
        conditions: [
            {
                field: ".inode.schema_id",
                op: "=",
                value: scriptTaskRecordSchema
            }
        ]
    }
    var taskRecordObject = {
        indexes: {
            "cmdb_index-3kyli9jj9w7ua": execStatusRunning,
            "cmdb_index-5nmjlz3wl24o": Math.ceil(now),
        },
    }
    ctx.ecu.cmdb.updateObjects(taskRecordQuery, {
        object: taskRecordObject,
        updates: [
            ".indexes.cmdb_index-3kyli9jj9w7ua",
            ".indexes.cmdb_index-5nmjlz3wl24o",
        ],
    })
}
var output = { "ok": true };
try {
    main();
} catch (e) {
    output.ok = false;
    output.error = e.message;
}

ctx.output(output)
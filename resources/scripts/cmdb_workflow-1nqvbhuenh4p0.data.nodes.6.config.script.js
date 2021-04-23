// 重新执行「脚本执行任务」中的「完成处理」

// 输入规格：
// {
//     "task_id": "", // 外部可通过此字段预指定生成的 script_task_id
//     "step_id": "" // 工单步骤
// }

// 输出规格：
// {
// }
var ctx = new WorkflowRuntimeContext()
var input = ctx.input() // 获取input数据
// var debug = {}

var scriptTaskRecordSchema = "cmdb_schema_x-3cu4v1w20seby"


// 根据脚本任务 ID 获取所有的脚本执行记录，以拼装工单组件的输出
//
function fetchScriptTaskResults(script_task_id) {
    var record_query = {
        objects: ["$conditions"],
        conditions: [
            {
                field: "inode.schema_id",
                op: "=",
                value: scriptTaskRecordSchema
            },
            {
                field: "indexes.cmdb_index-2f84ou7p5ewhp",
                op: "=",
                value: script_task_id
            },
        ], selects: [
            ".data.exit_code",
            ".data.output",
            ".indexes.cmdb_index-3d2auxg8f3gdv",
            ".indexes.cmdb_index-3kyli9jj9w7ua",
        ],
    }
    var query_ret = ctx.ecu.cmdb.queryObjects(record_query, { count_mode: "nocount" })
    var stats = { total: 0, succeeded: 0, failed: 0, unknown: 0, canceled: 0 }
    var script_results = []
    query_ret.objects.forEach(function (record) {
        stats.total++
        switch (record.indexes["cmdb_index-3kyli9jj9w7ua"]) {
            case "SUCCEEDED":
                stats.succeeded++
                break
            case "FAILED":
                stats.failed++
                break
            case "CANCELED":
                stats.canceled++
                break
            default:
                stats.unknown++
                break
        }
        server_object = record.indexes["cmdb_index-3d2auxg8f3gdv"]
        script_results.push({
            server_id: (server_object && server_object.inode) ? server_object.inode.id : "",
            exit_code: record.data.exit_code,
            output: record.data.output,
        })
    })
    return {
        ok: true,
        output: {
            script_task_id: script_task_id,
            stats: stats,
            script_results: script_results
        }
    }
}

// function notifyTicketStatusChange(ticket_id) {
//     if (!ticket_id) {
//         return
//     }
//     try {
//         ctx.ecu.kvdb.batchWriteKeyValue("MCOP", [{
//             type: "TICKET",
//             key: "status_update_notify",
//             id: ticket_id,
//             value: "{}",
//         }])
//     } catch (e) { }
// }

function main() {
    if (!input.task_id || !input.step_id) {
        return
    }
    var ret = fetchScriptTaskResults(input.task_id);
    if (!ret.ok) {
        return
    }
    var stats = ret.output.stats;
    if (stats.succeeded < stats.total) {
        return
    }
    ctx.ecu.cmdb.updateObjects({
        objects: [input.step_id],
        conditions: [
            {
                field: ".inode.schema_id",
                op: "=",
                value: "cmdb_schema_x-1npbqzvnj45gz"
            },
            {
                field: ".indexes.cmdb_index-2pshjc1k53sbp",
                op: "=",
                value: "FAILED"
            }
        ]
    }, {
        object: {
            data: {
                result: {
                    result: "SUCCEEDED",
                    result_name: "执行成功"
                },
                context: ret.output,
                result_name: "重新执行成功"
            },
            indexes: {
                "cmdb_index-2pshjc1k53sbp": "SUCCEEDED"
            }
        },
        updates: [
            ".indexes.cmdb_index-2pshjc1k53sbp",
            ".data.context",
            ".data.result",
            ".data.result_name"
        ]
    });
    // ret = ctx.ecu.ql.queryQlTable({
    //     objects: [input.step_id],
    //     conditions: [
    //         {
    //             field: ".inode.schema_id",
    //             op: "=",
    //             value: "cmdb_schema_x-1npbqzvnj45gz"
    //         }
    //     ],
    //     selects: [".indexes.cmdb_index-3rmcxh5kedl6y"]
    // }, {}, { count_mode: "nocount" })
    
    // if (ret.rows && ret.rows.length) {
    //     var ticketId = ret.rows[0].data[1];
    //     debug.id = ticketId;
    //     notifyTicketStatusChange(ticketId);
    // }
}

main();
// ctx.output(debug)

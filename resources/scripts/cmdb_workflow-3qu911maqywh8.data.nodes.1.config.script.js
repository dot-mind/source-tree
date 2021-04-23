// [AutoGen]「工单实例」Canceler

/*
输入：
{
    "ticket_instance_id": ""
}

输入：
{
    "result": "SUCCEEDED/FAILED",
    "result_name": "",
    "message": "",
}
*/

var ctx = new WorkflowRuntimeContext();
var input = ctx.input();
var ecu = ctx.getECU();

var output = {
    "result": "",
    "result_name": "",
    "message": "",
};

var ticket_template_id = "[object Object]" // 将被替换为实际 ID

var ticketTemplateSchema = "cmdb_schema_x-xvbpbt1vit95"
var ticketComponentSchema = "cmdb_schema_x-13wfmv1w1c0om"
var ticketInstanceSchema = "cmdb_schema_x-16gddn9zkbt5z"
var ticketStepInstanceSchema = "cmdb_schema_x-1npbqzvnj45gz"
var ticketComponentLogSchema = "cmdb_schema_x-2v6829ff8z123"

var ticketTypeIndex = "cmdb_index-1c8wfs912y3h0"
var ticketTemplateIndex = "cmdb_index-m5rn0qhfaw4c"
var ticketStatusIndex = "cmdb_index-bu4nsnqtx6os"
var ticketStepStatusIndex = "cmdb_index-2enmd4pisoayc"
var ticketStepResultIndex = "cmdb_index-2pshjc1k53sbp"
var ticketComponentIndex = "cmdb_index-1pasrwt1l5c4j"
var ticketInstanceIndex = "cmdb_index-3rmcxh5kedl6y"

var statusPENDING = "PENDING" // for ticket and step
var statusWAITINGEXECUTE = "WAITING_EXECUTE"
var statusPROCESSING = "PROCESSING" // for ticket and step
var statusFINISHED = "FINISHED" // for ticket and step
var statusWAITING = "WAITING" // for ticket and step
var statusCANCELED = "CANCELED" // for ticket and step
var statusCLOSED = "CLOSED" // for ticket

var resultSUCCEEDED = "SUCCEEDED" // for step
var resultFAILED = "FAILED" // for step
var resultUNKNOWN = "UNKNOWN" // for step

// 返回值：
// {
//     ok: true/false,
//     message: ""
// }
function validateTicketCancelInput(ticket_instance_id) {
    if (!ticket_instance_id) {
        return { ok: false, message: "未指定目标「工单实例」" }
    }
    return { ok: true }
}

// 获取一个「工单实例」的详情
// 返回值：
// {
//     ok: true/false,
//     message: "",
//     ticket_instance: {},
// }
function fetchTicketInstance(ticket_instance_id) {
    instance_query = {
        conditions: [{ field: "inode.schema_id", op: "=", value: ticketInstanceSchema }],
        objects: [ticket_instance_id], selects: ["."], limit: 1,
    }
    query_ret = {}
    try {
        query_ret = ctx.ecu.cmdb.queryObjects(instance_query, { count_mode: "nocount" })
    } catch (e) {
        return { ok: false, message: "操作异常，请联系系统管理员" }
    }
    if (!query_ret.objects || !query_ret.objects.length) {
        return { ok: false, message: "操作目标不存在（或没有操作权限）" }
    }
    instance_object = query_ret.objects[0]
    return {
        ok: true, ticket_instance: {
            id: instance_object.inode.id,
            name: instance_object.inode.name,
            descr: instance_object.inode.descr,
            steps: instance_object.data.steps,
            input: instance_object.data.input,
            input_schema: instance_object.data.input_schema,
            workflow_job: instance_object.data.workflow_job,
            status: instance_object.indexes["cmdb_index-bu4nsnqtx6os"]
        }
    }
}

// 终止一个「工单实例」的流转执行
// 返回值：
// {
//     ok: true/false,
//     message: "",
// }
function cancelTicketInstance(ticket_instance_id) {
    // 1. 获取工单实例当前状态
    instance_ret = fetchTicketInstance(ticket_instance_id)
    if (!instance_ret.ok) {
        return { ok: false, message: instance_ret.message }
    }
    ticket_instance = instance_ret.ticket_instance
    if (ticket_instance.status != statusPROCESSING) {
        return { ok: false, message: "无法终止此工单，工单状态为：" + ticket_instance.status }
    }
    if (!ticket_instance.workflow_job) {
        return { ok: false, message: "工单状态异常，操作失败" }
    }
    // 2. Cancel 工单实例对应的 executor 执行工作流
    cancel_result = {}
    try {
        cancel_result = ctx.ecu.workflow.cancelWorkflowJobs([ticket_instance.workflow_job])
    } catch (e) {
        return { ok: false, message: "操作异常，请稍后重试：" + e.message }
    }
    // 3. 等待工作流任务运行结束，并获取工作流
    job_detail = {}
    try {
        job_detail = ctx.ecu.workflow.waitWorkflowJobFinish(ticket_instance.workflow_job)
    } catch (e) {
        return { ok: false, message: "无法获取工单流转结果：" + e.message }
    }
    if (!job_detail.canceled) {
        return { ok: false, message: "操作失败（工单已流转完成）" }
    }
    // 4. 更新「工单实例」与「工单步骤实例」的状态
    instance_query = {
        conditions: [
            {
                field: "inode.schema_id",
                op: "=",
                value: ticketInstanceSchema
            }
        ],
        objects: [ticket_instance_id], limit: 1,
    }
    new_instance_object = {
        indexes: {
            "cmdb_index-bu4nsnqtx6os": statusCANCELED,
        },
    }
    update_ret = {}
    try {
        update_ret = ctx.ecu.cmdb.updateObjects(
            instance_query,
            {
                object: new_instance_object,
                updates: [".indexes.cmdb_index-bu4nsnqtx6os"],
            }
        )
    } catch (e) {
        return {
            ok: false,
            message: "操作异常，请联系系统管理员：" + e.message
        }
    }
    step_instances = []
    ticket_instance.steps.forEach(function (step) {
        step_instances.push(step.step_instance_id)
    })
    step_instance_query = {
        conditions: [
            {
                field: "inode.schema_id",
                op: "=",
                value: ticketStepInstanceSchema
            },
            {
                field: "indexes.cmdb_index-3rmcxh5kedl6y",
                op: "=",
                value: ticket_instance_id
            },
            {
                field: "indexes.cmdb_index-2enmd4pisoayc",
                op: "=-",
                value: [
                    statusPENDING,
                    statusPROCESSING,
                    statusWAITING,
                    statusWAITINGEXECUTE
                ]
            },
        ], objects: step_instances,
    }
    new_instance_object = {
        data: {
            status_name: "步骤未执行",
            result_name: "无流转结果（流程被取消）",
        },
        indexes: {
            "cmdb_index-2enmd4pisoayc": statusCANCELED,
            "cmdb_index-2pshjc1k53sbp": resultUNKNOWN,
        },
    }
    try {
        update_ret = ctx.ecu.cmdb.updateObjects(
            step_instance_query,
            {
                object: new_instance_object,
                updates: [
                    ".data.status_name",
                    ".data.result_name",
                    ".indexes.cmdb_index-2enmd4pisoayc",
                    ".indexes.cmdb_index-2pshjc1k53sbp",
                ],
            }
        )
    } catch (e) {
        return { ok: false, message: "操作异常，请联系系统管理员" }
    }
    return { ok: true }
}

function mainProcessFunction() {
    // 1. 验证输入的参数是否合法
    validate_ret = validateTicketCancelInput(input.ticket_instance_id);
    if (!validate_ret.ok) {
        output.result = "FAILED"
        output.result_name = "参数校验错误"
        output.message = validate_ret.message
        return
    }
    // 2. 终止一个「工单实例」的流转执行
    cancel_ret = cancelTicketInstance(input.ticket_instance_id)
    if (!cancel_ret.ok) {
        output.result = "FAILED"
        output.result_name = "工单操作失败"
        output.message = cancel_ret.message
        return
    }
    output.result = "SUCCEEDED"
    output.result_name = "工单操作成功"
    output.message = "工单执行流程已被正常终止"
}

try {
    mainProcessFunction();
} catch (e) {
    output.result = "FAILED"
    output.result_name = "工单操作失败"
    output.message = "操作异常，请稍后重试"
}
ctx.output(output);

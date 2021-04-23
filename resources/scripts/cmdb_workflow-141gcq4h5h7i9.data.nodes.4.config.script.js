// [AutoGen]「工单实例」Launcher（ExecWait Part）
// 参数校验 -> 创建「工单实例」对象 -> 参数检验 / 维护「工单实例」和「工单步骤实例」状态 -> 执行步骤流转子工作流 -> 维护「工单实例」和「工单步骤实例」状态 -> 返回「工单实例」信息

/*
输入：
{
    "ticket_template": {
        "ticket_name": "",
        "ticket_descr": "",
        "steps": [{}],
        "workflows": {},
    },
    "ticket_instance": {
        "ticket_instance_name": "ticket_instance_name",
        "ticket_instance_id": "ticket_instance_id",
        "ticket_input": {},
        "step_instances": ["step_instance_id",...]
    },
}

输入：{}
*/

var ctx = new WorkflowRuntimeContext();
var input = ctx.input();
var ecu = ctx.ecu;

var output = {
    result: "", result_name: "", message: "",
    debug: {},
};

var ticket_template_id = "cmdb_x-1y92p5sw67gf5" // 将被替换为实际 ID

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

var policyNextStep = "NEXT_STEP"
var policyAbortFlow = "ABORT_FLOW"

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
var finishWF = "cmdb_workflow-29o6rqcnckgit"

function notifyTicketStatusChange(ticket_id) {
    if (!ticket_id) {
        return
    }
    try {
        ecu.kvdb.batchWriteKeyValue("MCOP", [{
            type: "TICKET", key: "status_update_notify", id: ticket_id,
            value: "{}",
        }])
    } catch(e) {}
}

// [同步] 发起对 executor 工作流的调用执行并等待完成
// 返回值：
// {
//     "ok": true/false,
//     "message": "error message",
// }
function executeTicketInstance(ticket_template, ticket_instance) {
    executor = ticket_template.workflows["executor"]
    if (!executor) {
        return {ok: false, message: "工单模板异常，请联系系统管理员"}
    }
    // 1. 启动工作流任务
    workflow_input = {
        ticket_template: ticket_template,
        ticket_instance_id: ticket_instance.ticket_instance_id,
        ticket_instance_name: ticket_instance.ticket_instance_name,
        ticket_input: ticket_instance.ticket_input,
        step_instances: ticket_instance.step_instances,
    }
    wf_return = {}
    try {
        wf_return = ecu.workflow.createWorkflowJob(executor, workflow_input)
    } catch(e) {
        return {ok: false, message: "工单流转失败："+e.message}
    }
    // 2. 记录工作流任务 ID
    update_query = {
        conditions: [{field: "inode.schema_id", op:"=", value: ticketInstanceSchema}],
        objects: [ticket_instance.ticket_instance_id], selects: ["."], limit: 1,
    }
    instance_object = {
        data: {
            workflow_job: wf_return.id,
        },
        indexes: {
            "cmdb_index-bu4nsnqtx6os": statusPROCESSING,
        },
    }
    try {
        ecu.cmdb.updateObjects(update_query, {
            object: instance_object,
            updates: [".data.workflow_job", ".indexes.cmdb_index-bu4nsnqtx6os"],
        })
    } catch(e) {
        return {ok: false, message: "操作异常："+e.message}
    }
    // 3. 等待工作流任务运行结束
    try {
        ecu.workflow.createWorkflowJob(finishWF, {
            ticket_instance_id: ticket_instance.ticket_instance_id,
            workflow_job: wf_return.id
        })
    } catch(e) {
        return {ok: false, message: "工单流转失败："+e.message}
    }
    return {ok: true}
}

function mainProcessFunction() {
    exec_ret = executeTicketInstance(input.ticket_template, input.ticket_instance)
    if (!exec_ret.ok) {
        output.result = "FAILED"
        output.result_name = "工单流转失败"
        output.message = exec_ret.message
        return
    }
    output.result = "SUCCEEDED"
    output.result_name = "工单已流转完成"
}

try {
    mainProcessFunction();
    notifyTicketStatusChange(input.ticket_instance.ticket_instance_id)
} catch (e) {
    output.result = "FAILED"
    output.result_name = "工单流转失败"
    output.message = "操作异常，请稍后重试："+e.message
}
ctx.output(output);

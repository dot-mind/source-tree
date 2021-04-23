// Close 一个已经执行完成的「工单实例」

// 输入规格：
// {
//     "ticket_template_id": "",
//     "ticket_instance_id": ""
// }

// 输出规格：
// {
//     "result": "SUCCEEDED/FAILED",
//     "result_name": "操作成功",
//     "message": "message",
// }

var ctx = new WorkflowRuntimeContext();
var input = ctx.input();
var ecu = ctx.getECU();

var output = {
    "result": "",
    "result_name": "",
    "message": "",
};

var ticketTemplateSchema = "cmdb_schema_x-xvbpbt1vit95"

// 检查输入参数的合法性
//
// 返回值：
// {
//     "ok": true/false,
//     "message": "",
// }
function validateCloserInput(input) {
    if (!input.ticket_template_id) {
        return {ok: false, message: "请提供目标「工单模板」ID"}
    }
    if (!input.ticket_instance_id) {
        return {ok: false, message: "请提供目标「工单实例」ID"}
    }
    return {ok: true}
}

// 获取「工单模板」配置对象中的 launcher 工作流
//
// 返回值：
// {
//     "ok": true/false,
//     "message": "",
//     "workflow_id": ""
// }
function fetchCloserWorkflow(ticket_template_id) {
    query_result = {}
    try {
        ticketQuery = {
            objects: [ticket_template_id],
            conditions: [
                {field: ".inode.schema_id", op: "=", value: ticketTemplateSchema},
            ], selects: [".data.workflows.closer"], limit: 1,
        }
        ecu.cmdb.queryObjects(ticketQuery, {count_mode: "no_count"})
    } catch(e) {
        return {ok: false, message: "操作异常，请稍后重试"}
    }
    if (!query_result.objects || !query_result.objects.length) {
        return {ok: false, message: "指定的工单模板不存在（或没有操作权限）"}
    }
    ticket_object = query_result.objects[0]
    if (!ticket_object.data || !ticket_object.data.workflows ||
        !ticket_object.data.workflows.closer) {
        return {ok: false, message: "工单模板配置异常（请联系系统管理员）"}
    }
    return {ok: true, workflow_id: ticket_object.data.workflows.closer}
}

// 同步调用「工单模板」的 launcher 工作流
//
// 返回值：
// {
//     "ok": true/false,
//     "message": "",
// }
function callTicketTemplateCloser(closer_wf_id, ticket_instance_id) {
    workflow_input = {
        ticket_instance_id: ticket_instance_id,
    }
    wf_return = {}
    try {
        wf_return = ecu.workflow.startAndWaitWorkflowJobFirstOutput(closer_wf_id, workflow_input)
    } catch(e) {
        return {ok: false, message: "工单关闭异常："+e.message}
    }
    if (wf_return.aborted) {
        return {ok: false, message: "工单关闭异常，被中断执行："+wf_return.runtime_error}
    }
    return wf_return.output
}

function mainProcessFunction() {
    validate_ret = validateCloserInput(input)
    if (!validate_ret.ok) {
        output.result = "FAILED"
        output.result_name = "提交参数错误"
        output.message = validate_ret.message
        return
    }
    workflow_ret = fetchCloserWorkflow(input.ticket_template_id);
    if (!workflow_ret.ok) {
        output.result = "FAILED"
        output.result_name = "无法获取工单模板"
        output.message = workflow_ret.message
        return
    }
    output = callTicketTemplateCloser(workflow_ret.workflow_id, input.ticket_instance_id)
}

try {
    mainProcessFunction();
} catch (e) {
    output.result = "FAILED"
    output.result_name = "工单操作失败"
    output.message = "操作异常，请稍后重试"
}
ctx.output(output);
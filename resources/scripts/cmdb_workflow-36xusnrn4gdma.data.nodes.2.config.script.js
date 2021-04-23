// Cancel 一个正在执行的「工单实例」

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

var output = {
    "result": "",
    "result_name": "",
    "message": "",
};

var ticketTemplateSchema = "cmdb_schema_x-xvbpbt1vit95"
var ticketInstanceSchema = "cmdb_schema_x-16gddn9zkbt5z"
var userAccountSchema = "cmdb_schema_x-d97uo84ongx8"

// 检查输入参数的合法性
//
// 返回值：
// {
//     "ok": true/false,
//     "message": "",
// }
function validateCancelerInput(input) {
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
function fetchCancelerWorkflow(ticket_template_id) {
    var query_result = {}
    try {
        ticketQuery = {
            objects: [ticket_template_id],
            conditions: [
                {field: ".inode.schema_id", op: "=", value: ticketTemplateSchema},
            ], selects: [".data.workflows.canceler"], limit: 1,
        }
        query_result = ctx.ecu.cmdb.queryObjects(ticketQuery, {count_mode: "nocount"})
    } catch(e) {
        return {ok: false, message: "操作异常，请稍后重试"}
    }
    if (!query_result.objects || !query_result.objects.length) {
        return {ok: false, message: "指定的工单模板不存在（或没有操作权限）"}
    }
    var ticket_object = query_result.objects[0]
    if (!ticket_object.data || !ticket_object.data.workflows ||
        !ticket_object.data.workflows.canceler) {
        return {ok: false, message: "工单模板配置异常（请联系系统管理员）"}
    }
    return {ok: true, workflow_id: ticket_object.data.workflows.canceler}
}

function notifyTicketStatusChange(ticket_id) {
    if (!ticket_id) {
        return
    }
    try {
        ctx.ecu.kvdb.batchWriteKeyValue("MCOP", [{
            type: "TICKET", key: "status_update_notify", id: ticket_id,
            value: "{}",
        }])
    } catch(e) {}
}

// 同步调用「工单模板」的 canceler 工作流
//
// 返回值：
// {
//     "ok": true/false,
//     "message": "",
// }
function callTicketTemplateCanceler(canceler_wf_id, ticket_instance_id) {
    var workflow_input = {
        ticket_instance_id: ticket_instance_id,
    }
    var wf_return = {}
    try {
        wf_return = ctx.ecu.workflow.startAndWaitWorkflowJobFirstOutput(canceler_wf_id, workflow_input)
    } catch(e) {
        return {ok: false, message: "工单终止异常："+e.message}
    }
    if (wf_return.aborted) {
        return {ok: false, message: "工单终止异常，被中断执行："+wf_return.runtime_error}
    }
    notifyTicketStatusChange(ticket_instance_id)
    return wf_return.output
}

function fetchInstance(instance_id) {
    var instance_query = {
        conditions: [
            {
                field: "inode.schema_id",
                op: "=",
                value: ticketInstanceSchema
            }
        ],
        objects: [instance_id],
        selects: [".inode.creator", ".data.creator", ".data.handler_config"],
        limit: 1,
    }
    var query_ret = {}
    try {
        query_ret = ctx.ecu.cmdb.queryObjects(instance_query, { count_mode: "nocount" })
    } catch (e) {
        return { ok: false, message: "操作异常，请联系系统管理员" }
    }
    if (!query_ret.objects || !query_ret.objects.length) {
        return { ok: false, message: "操作目标不存在（或没有操作权限）" }
    }
    var instance_object = query_ret.objects[0]
    return {
        ok: true,
        instance: {
            executor: instance_object.data.creator || instance_object.inode.creator,
            handler_config: instance_object.data.handler_config
        }
    }
}

function unzipRoles(roles) {
    var result = [];
    var deep = {};
    for (var i = 0; i < roles.length; i++) {
        var role = roles[i];
        deep[role] = true;
        result.push(role);
    }
    var child = roles;
    while(child.length) {
        var ql = {
            objects: ["$conditions"],
            conditions: [
                {
                    field: "inode.schema_id",
                    op: "=",
                    value: "cmdb_schema_x-d14i1fk03omi"
                },
                {
                    field: "indexes.cmdb_index-c456dxku2g1d",
                    op: "=-",
                    value: child
                }
            ],
            selects: ["inode.id"],
        };
        var ret = ctx.ecu.cmdb.queryObjects(ql, {count_mode: "nocount"});
        child = ret.objects.map(function(o) {
            return String(o.inode.id);
        }).filter(function(id) {
            if (!deep[id]) {
                deep[id] = true
                result.push(id);
                return id;
            }
        });
    }
    return result;
}


function queryAccount(sysAccount) {
    var ql = {
        objects: ["$conditions"],
        conditions: [
            {field: ".inode.schema_id", op: "=", value: userAccountSchema},
            {field: ".indexes.cmdb_index-sys_account", op: "=", value: sysAccount},
        ],
        selects: [],
        limit: 1
    }
    var result = ctx.ecu.ql.queryQlTable(ql, {}, {count_mode: "nocount"});
    if (result.rows && result.rows.length) {
        return result.rows[0].data[0];
    }
    return null;
}

function checkConfirmPermit(instance) {
    var currentExecutor = String(ctx.getExecutor())
    var executor = String(instance.executor)
    if (currentExecutor === executor) {
        return { ok: true }
    }
    var currentAccount = queryAccount(currentExecutor);
    if (!currentAccount) {
        return { ok: false }
    }
    var handlerConfig = instance.handler_config || {};
    var handlerType = handlerConfig.type || "account";
    var query = null;
    switch(handlerType) {
        case "account":
            if (!handlerConfig.other_accounts || !handlerConfig.other_accounts.length) {
                return {ok: false}
            }
            query = {
                objects: [currentAccount],
                conditions: [
                    {
                        field: ".inode.id",
                        op: "=-",
                        value: handlerConfig.other_accounts
                    },
                    {
                        field: ".inode.schema_id",
                        op: "=",
                        value: userAccountSchema
                    },
                ],
                limit: 1
            };
            break;
        case "role":
            // 处理
            if (!handlerConfig.roles || !handlerConfig.roles.length) {
                return {ok: false}
            }
            // 压平组织父子级
            var roles = unzipRoles(handlerConfig.roles);
            query = {
                objects: ["$conditions"],
                conditions: [
                    {
                        field: ".inode.schema_id",
                        op: "=",
                        value: "cmdb_schema_x-3pmf2v3beupg4"
                    },
                    {
                        field: ".indexes.cmdb_index-3ufxmib5lgra3",
                        op: "=-",
                        value: roles
                    },
                    {
                        field: ".indexes.cmdb_index-37e2ysb2p4qrf",
                        op: "=",
                        value: currentAccount
                    }
                ],
                limit: 1
            };
            break;

    }
    var result = ctx.ecu.ql.queryQlTable(query, {}, {count_mode: "nocount"});
    if (!result.rows || !result.rows.length) {
        return {ok: false}
    }
    return { ok: true }
}


function mainProcessFunction() {
    var validate_ret = validateCancelerInput(input)
    if (!validate_ret.ok) {
        output.result = "FAILED"
        output.result_name = "提交参数错误"
        output.message = validate_ret.message
        return
    }
    var instance_ret = fetchInstance(input.ticket_instance_id)
    if (!instance_ret.ok) {
        output.result = "FAILED"
        output.result_name = "获取工单实例错误"
        output.message = instance_ret.message
        return
    }

    var check_ret = checkConfirmPermit(instance_ret.instance)
    if (!check_ret.ok) {
        output.result = "FAILED"
        output.result_name = "无权限"
        output.message = "工单中未将你配置为可流转人员"
        return
    }

    var workflow_ret = fetchCancelerWorkflow(input.ticket_template_id);
    if (!workflow_ret.ok) {
        output.result = "FAILED"
        output.result_name = "无法获取工单模板"
        output.message = workflow_ret.message
        return
    }
    output = callTicketTemplateCanceler(workflow_ret.workflow_id, input.ticket_instance_id)
}

try {
    mainProcessFunction();
} catch (e) {
    output.result = "FAILED"
    output.result_name = "工单操作失败"
    output.message = "操作异常，请稍后重试: " + e.message
}
ctx.output(output);
// 手动对处于 WAITING 状态的「工单步骤实例」进行流转

// 输入规格：
// {
//     "instance_id": "", //「工单步骤实例」ID
//     "next_policy": "NEXT_STEP/ABORT_FLOW"
// }

// 输出规格：
// {
//     "result": "SUCCEEDED/FAILED",
//     "result_name": "操作成功",
//     "message": "message",
// }

var ctx = new WorkflowRuntimeContext();
var input = ctx.input();
var ecu = ctx.ecu;

var output = {
    "result": "",
    "result_name": "",
    "message": "",
    "output": {},
};

var userAccountSchema = "cmdb_schema_x-d97uo84ongx8"

var ticketTemplateSchema = "cmdb_schema_x-xvbpbt1vit95"
var ticketComponentSchema = "cmdb_schema_x-13wfmv1w1c0om"
var ticketInstanceSchema = "cmdb_schema_x-16gddn9zkbt5z"
var ticketStepInstanceSchema = "cmdb_schema_x-1npbqzvnj45gz"
var ticketComponentLogSchema = "cmdb_schema_x-2v6829ff8z123"

var ticketTypeIndex = "cmdb_index-1c8wfs912y3h0"
var ticketStatusIndex = "cmdb_index-bu4nsnqtx6os"
var ticketStepStatusIndex = "cmdb_index-2enmd4pisoayc"
var ticketStepResultIndex = "cmdb_index-2pshjc1k53sbp"

var policyNextStep = "NEXT_STEP"
var policyExecuteStep = "EXECUTE_STEP"
var policyAbortFlow = "ABORT_FLOW"

var statusPENDING = "PENDING" // for ticket and step
var statusWAITINGEXECUTE = "WAITING_EXECUTE"
var statusPROCESSING = "PROCESSING" // for ticket and step
var statusFINISHED = "FINISHED" // for ticket and step
var statusCANCELED = "CANCELED" // for ticket and step
var statusWAITING = "WAITING" // for ticket and step
var statusCLOSED = "CLOSED" // for ticket

var resultSUCCEEDED = "SUCCEEDED" // for step
var resultFAILED = "FAILED" // for step
var resultUNKNOWN = "UNKNOWN" // for step


function handlerIsEmpty(config) {
    if (config.executor) {
        return false;
    }
    var type = config.type || "account";
    switch(type) {
        case "account":
            if (config.other_accounts && config.other_accounts.length) {
                return false
            }
            break;
        case "role":
            if (config.roles && config.roles.length) {
                return false
            }
            break;
    }
    return true;
}

// 校验此「工单步骤实例」的输入参数，返回值：
// {
//     "ok": true/false,
//     "message": "",
//     "instance": {
//         "executor": "",
//         "status": "",
//         "handler_config": {
//             "executor": true/false,
//             "other_accounts": []
//         }
//     }
// }
function fetchInstanceInfo(instance_id) {
    var instanceQuery = {
        objects: [instance_id],
        conditions: [
            {field: ".inode.schema_id", op: "=", value: ticketStepInstanceSchema},
        ], selects: [
            ".inode.creator",
            ".data.handler_config",
            ".indexes.cmdb_index-2enmd4pisoayc",
            ".indexes.cmdb_index-3rmcxh5kedl6y"
        ], limit: 1,
    }
    var query_result = {}
    try {
        query_result = ecu.ql.queryQlTable(instanceQuery, {count_mode: "nocount"})
    } catch (e) {
        return {ok: false, message: "操作异常，请稍后重试"}
    }
    if (!query_result.rows || !query_result.rows.length) {
        return {ok: false, message: "工单步骤实例不存在（或没有相应权限）"}
    }
    var instance_object = query_result.rows[0];
    var query = {
        objects: [instance_object.data[4]],
        conditions: [
            {field: ".inode.schema_id", op: "=", value: ticketInstanceSchema},
        ], selects: [
            ".data.handler_config",
            ".data.creator",
        ], limit: 1,
    }
    var handlerConfig = instance_object.data[2] || {};
    
    var result = ecu.ql.queryQlTable(query, {count_mode: "nocount"});
    if (!result.rows || !result.rows.length) {
        return {ok: false, message: "工单实例不存在（或没有相应权限）"}
    }
    var ticketHandlerConfig = result.rows[0].data[1] || {};
    ticketHandlerConfig.executor = true;
    if (ticketHandlerConfig.inherit || handlerIsEmpty(handlerConfig)) {
        handlerConfig = ticketHandlerConfig;
    }
    var executor = result.rows[0].data[2];
    return {ok: true, instance: {
        executor: executor || instance_object.data[1],
        handler_config: handlerConfig,
        status: instance_object.data[3],
    }}
}

// 校验此「工单步骤实例」进行确认时的输入参数，返回值：
// {
//     "ok": true/false,
//     "message": "",
// }
function validateConfirmInput(input) {
    if (!input.instance_id) {
        return {ok: false, message: "缺失用于执行的上下文数据（请联系管理员）"}
    }
    switch (input.next_policy) {
    case "NEXT_STEP":
        break;
    case "ABORT_FLOW":
        break;
    case policyExecuteStep:
        break
    default:
        return {ok: false, message: "支持参数：EXECUTE_STEP/NEXT_STEP/ABORT_FLOW"}
    }
    return {ok: true}
}

function checkConfirmPolicy(instance_info, nextPolicy) {
    var ret = {ok: true}
    var status = instance_info.status
    switch(status) {
        case statusWAITINGEXECUTE:
            if (nextPolicy === policyExecuteStep) {
                return ret
            }
            break
        case statusWAITING:
            if (nextPolicy === policyAbortFlow || nextPolicy === policyNextStep) {
                return ret
            }
            break
    }
    return {ok: false, message: "当前步骤状态不支持该操作：" + nextPolicy}
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

// 校验当前用户是否有权限对步骤进行流转操作，返回值：
// {
//     "ok": true/false,
// }
function checkConfirmPermit(instance_info) {
    var ticket_executor = instance_info.executor
    var handler_config = instance_info.handler_config
    var currentExecutor = String(ctx.getExecutor());
    var currentAccount = queryAccount(currentExecutor);
    if (handler_config.executor) {
        if (currentExecutor == ticket_executor) {
            return {ok: true}
        }
    }
    // 当前执行者没有与人员关联不参与以下判断
    if (!currentAccount) {
        return {ok: false}
    }
    // 由于是扩展出来的默认为人员选择
    var handlerType = handler_config.type || "account";
    var query_result = {}
    var accountQuery = {};
    if (handlerType === "role") {
        // 处理
        if (!handler_config.roles || !handler_config.roles.length) {
            return {ok: false}
        }
        // 压平组织父子级
        var roles = unzipRoles(handler_config.roles);
        accountQuery = {
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
    } else {
        if (!handler_config.other_accounts || !handler_config.other_accounts.length) {
            return {ok: false}
        }
        accountQuery = {
            objects: [currentAccount],
            conditions: [
                {
                    field: ".inode.id",
                    op: "=-",
                    value: handler_config.other_accounts
                },
                {
                    field: ".inode.schema_id",
                    op: "=",
                    value: userAccountSchema
                },
            ],
            limit: 1
        };
    }
    try {
        query_result = ecu.ql.queryQlTable(accountQuery, {}, {count_mode: "nocount"});
    } catch (e) {
        return {ok: false, message: "操作异常，请稍后重试"}
    }
    if (!query_result.rows || !query_result.rows.length) {
        return {ok: false}
    }
    return {ok: true}
}

// 校验当前用户是否有权限对步骤进行流转操作，返回值：
// {
//     "ok": true/false,
// }
function sendConfirmNotify(next_policy, stepInput) {
    try {
        var value = {
            next_policy: next_policy,
        };
        if (next_policy === policyExecuteStep && stepInput) {
            value.input = stepInput
        }
        ecu.kvdb.batchWriteKeyValue("MCOP", [{
            type: "TICKET_STEP", key: "manual_confirm_result",
            id: input.instance_id,
            value: JSON.stringify(value),
        }])
    } catch(e) {
        return {ok: false, message: "发送流转信号失败："+e.message}
    }
    return {ok: true}
}

function mainProcessFunction() {
    validate_ret = validateConfirmInput(input);
    if (!validate_ret.ok) {
        output.result = "FAILED"
        output.result_name = "参数错误"
        output.message = validate_ret.message
        return
    }
    instance_ret = fetchInstanceInfo(input.instance_id)
    if (!instance_ret.ok) {
        output.result = "FAILED"
        output.result_name = "获取步骤实例错误"
        output.message = instance_ret.message
        return
    }
    check_ret = checkConfirmPolicy(instance_ret.instance, input.next_policy)
    if (!check_ret.ok) {
        output.result = "FAILED"
        output.result_name = "工单步骤状态与参数不匹配"
        output.message = check_ret.message
        return
    }
    check_ret = checkConfirmPermit(instance_ret.instance)
    if (!check_ret.ok) {
        output.result = "FAILED"
        output.result_name = "无权限流转当前步骤"
        output.message = "工单步骤中未将你配置为可流转人员"
        return
    }
    notify_ret = sendConfirmNotify(input.next_policy, input.input)
    if (!notify_ret.ok) {
        output.result = "FAILED"
        output.result_name = "手动流转失败"
        output.message = notify_ret.message
        return
    }
    output.result = "SUCCEEDED"
    output.result_name = "手动流转完成"
    output.message = "工单步骤流转完成"
}

try {
    mainProcessFunction();
} catch (e) {
    output.result = "FAILED"
    output.result_name = "手动流转失败"
    output.message = "操作异常，请稍后重试"
}
ctx.output(output);
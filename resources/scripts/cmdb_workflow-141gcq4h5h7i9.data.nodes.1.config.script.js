// [AutoGen]「工单实例」Launcher（Prepare Part）
// 参数校验 -> 创建「工单实例」对象 -> 参数检验 / 维护「工单实例」和「工单步骤实例」状态 -> 执行步骤流转子工作流 -> 维护「工单实例」和「工单步骤实例」状态 -> 返回「工单实例」信息

/*
输入：
{
    "ticket_name": "",
    "ticket_descr": "",
    "ticket_input": {},
}

输出：
{
    "result": "SUCCEEDED/FAILED",
    "result_name": "",
    "message": "",
    "ticket_info": {
        "ticket_template": {
            "ticket_name": "",
            "ticket_descr": "",
            "ticket_type": "",
            "steps": [{},...],
            "input_schema": "",
            "vars_schema": "",
        },
        "ticket_instance": {
            "ticket_instance_name": "ticket_instance_name",
            "ticket_instance_id": "ticket_instance_id",
            "ticket_input": {},
            "step_instances": ["ticket_step_instance_id",...]
        }
    }
}
*/

var ctx = new WorkflowRuntimeContext();
var input = ctx.input();
var ecu = ctx.ecu;

var output = {
    "result": "",
    "result_name": "",
    "message": "",
    "ticket_info": {
        "ticket_template": {},
        "ticket_instance": {}
    },
    "debug":{},
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
var statusPROCESSING = "PROCESSING" // for ticket and step
var statusFINISHED = "FINISHED" // for ticket and step
var statusWAITING = "WAITING" // for ticket and step
var statusCANCELED = "CANCELED" // for ticket and step
var statusCLOSED = "CLOSED" // for ticket

var resultSUCCEEDED = "SUCCEEDED" // for step
var resultFAILED = "FAILED" // for step
var resultUNKNOWN = "UNKNOWN" // for step

// 获取「工单模板」配置对象
// 返回值：
// {
//     ok: true/false,
//     message: "",
//     ticket_template: {}
// }
function fetchTicketTemplate(ticket_template_id) {
    query_result = {}
    ticket_query = {
        objects: [ticket_template_id],
        conditions: [
            {field: "inode.schema_id", op: "=", value: ticketTemplateSchema},
        ], selects: ["."], limit: 1,
    }
    try {
        query_result = ecu.cmdb.queryObjects(ticket_query, {count_mode: "no_count"})
    } catch(e) {
        return {ok: false, message: "操作异常，请稍后重试："+e.message}
    }
    if (!query_result.objects || !query_result.objects.length) {
        return {ok: false, message: "指定的工单模板不存在（或没有操作权限）"}
    }
    ticket_object = query_result.objects[0]
    ticket_type = ticket_object.indexes[ticketTypeIndex]?ticket_object.indexes[ticketTypeIndex]:""
    ticket_template = {
        ticket_name: ticket_object.inode.name,
        ticket_descr: ticket_object.inode.descr,
        ticket_type: ticket_type,
        steps: ticket_object.data.steps,
        input_schema: ticket_object.data.input_schema,
        vars_schema: ticket_object.data.vars_schema,
        workflows: ticket_object.data.workflows,
        handler_config: ticket_object.data.handler_config,
        notify_config: ticket_object.data.notify_config
    }
    return {ok: true, ticket_template: ticket_template}
}

// 获取「工单组件」配置对象的字典
// 返回值：
// {
//     ok: true/false,
//     message: "",
//     components: {
//         "c1": {}, "c2": {},
//     }
// }
function fetchTicketComponentConfigs(components) {
    // TODO
}

// 校验「工单实例」的输入参数是否符合 JsonSchema 规格
// 返回值：
// {
//     ok: true/false,
//     message: ""
// }
function validateTicketInput(input_schema, input) {
    // TODO: ctx.utils.validateJsonSchema(input_schema, input.ticket_input)
    return {ok: true}
}

function fetchHandlerConfig(config) {
    var type = config.type || "account";
    if (type === "account" && config.other_accounts && config.other_accounts.length) {
        var ret = ctx.ecu.ql.queryQlTable({
            objects: config.other_accounts,
            conditions: [
                {
                    field: ".inode.schema_id",
                    op: "=",
                    value: "cmdb_schema_x-d97uo84ongx8"
                }
            ],
            selects: [".indexes.cmdb_index-sys_account"]
        }, {}, {count_mode: "nocount"});
        return {
            ok: true,
            ids: ret.rows.map(function(row) {
                return row.data[1];
            }).filter(function(id) {
                return !!id;
            })
        }
    }
    if (type === "role" && config.roles && config.roles.length) {
        var ret = ctx.ecu.ql.queryQlTable({
            objects: config.roles,
            conditions: [
                {
                    field: ".inode.schema_id",
                    op: "=",
                    value: "cmdb_schema_x-d14i1fk03omi"
                }
            ],
            selects: [".indexes.cmdb_index-rbys8yhm9dak"]
        }, {}, {count_mode: "nocount"});
        return {
            ok: true,
            ids: ret.rows.map(function(row) {
                return row.data[1];
            }).filter(function(id) {
                return !!id;
            })
        }
    }
    return {ok: false}
}

// 初始化创建「工单实例」和「工单步骤实例」对象
// 返回值：
// {
//     ok: true/false,
//     message: "",
//     ticket_instance: {
//         ticket_instance_id: "",
//         ticket_input: {},
//         step_instances: [], // id list
//     }
// }
function prepareTicketInstance(ticket_template, ticket_name, ticket_descr, ticket_input) {
    // 1. Prepare 步骤实例对象
    step_instance_objects = []
    ticket_template.steps.forEach(function(step){
        step_instance_object = {
            inode: {
                name: step.name,
                schema_id: ticketStepInstanceSchema,
            },
            data: {
                status_name: "步骤尚未流转",
                result_name: "无流转结果",
                config: {}, input: {}, context: {},
                // input_schema: TODO, output_schema: TODO,
                component: step.component_id,
                handler_config: step.handler_config,
                notify_config: step.notify_config,
            },
            indexes: {
                "cmdb_index-2enmd4pisoayc": statusPENDING,
                "cmdb_index-2pshjc1k53sbp": resultUNKNOWN,
                "cmdb_index-1pasrwt1l5c4j": step.component_id,
            },
        }
        step_instance_objects.push(step_instance_object)
    })
    create_ret = {}
    try {
        create_ret = ecu.cmdb.createObjects(step_instance_objects)
    } catch(e) {
        return {ok: false, message: "操作异常，请稍后重试："+e.message}
    }
    step_instances = create_ret.objects
    if (step_instances.length != ticket_template.steps.length) {
        return {ok: false, message: "初始化工单步骤异常，请联系系统管理员"}
    }

    // 2. Prepare「工单实例」
    ticket_instance_steps = []
    ticket_template.steps.forEach(function(step, i){
        ticket_instance_steps.push({
            name: step.name,
            step_instance_id: step_instances[i],
        })
    })
    var creator = ctx.getExecutor();
    ticket_instance_object = {
        inode: {
            name: ticket_name,
            descr: ticket_descr,
            schema_id: ticketInstanceSchema,
        },
        data: {
            creator: creator,
            input_schema: ticket_template.input_schema,
            input: ticket_input,
            steps: ticket_instance_steps,
            handler_config: ticket_template.handler_config,
            notify_config: ticket_template.notify_config
        },
        indexes: {
            "cmdb_index-bu4nsnqtx6os": statusPENDING,
            "cmdb_index-m5rn0qhfaw4c": ticket_template_id,
            "cmdb_index-9b4ggdmrzsn8": creator,
        },
    }
    var config = ticket_template.handler_config || {};
    var ret = fetchHandlerConfig(config);
    if (ret.ok) {
        if (config.type === "account") {
            ticket_instance_object.indexes["cmdb_index-touvkr324ym"] = ret.ids;
        } else {
            ticket_instance_object.indexes["cmdb_index-3v24cqm3zgy6l"] = ret.ids;
        }
    }
    create_ret = {}
    try {
        create_ret = ecu.cmdb.createObjects([ticket_instance_object])
    } catch(e) {
        return {ok: false, message: "操作异常，请稍后重试："+e.message}
    }
    if (!create_ret.objects || !create_ret.objects.length) {
        return {ok: false, message: "初始化工单步骤异常，请联系系统管理员"}
    }

    // 3. 设置「工单步骤实例」的关联索引
    update_ret = {}
    update_query = {
        conditions: [{field: "inode.schema_id", op:"=", value:ticketStepInstanceSchema}],
        objects: step_instances,
    }
    step_instance_object = {
        indexes: {
            "cmdb_index-3rmcxh5kedl6y": create_ret.objects[0],
        },
    }
    try {
        update_ret = ecu.cmdb.updateObjects(update_query, {
            object: step_instance_object, updates: [".indexes.cmdb_index-3rmcxh5kedl6y"],
        })
    } catch(e) {
        return {ok: false, message: "初始化工单步骤异常，请联系系统管理员："+e.message}
    }
    return {ok: true, ticket_instance: {
        ticket_instance_name: ticket_name,
        ticket_instance_id: create_ret.objects[0], step_instances: step_instances,
        ticket_input: ticket_input,
    }}
}

function mainProcessFunction() {
    // 1. 获取「工单模板」配置
    template_ret = fetchTicketTemplate(ticket_template_id)
    if (!template_ret.ok) {
        output.result = "FAILED"
        output.result_name = "配置获取失败"
        output.message = template_ret.message
        return
    }
    ticket_template = template_ret.ticket_template
    // 2. 验证输入的参数是否符合配置规格
    validate_ret = validateTicketInput(ticket_template.input_schema, input);
    if (!validate_ret.ok) {
        output.result = "FAILED"
        output.result_name = "参数校验错误"
        output.message = validate_ret.message
        return
    }
    // 3. 初始化「工单实例」与「工单步骤实例」对象
    prepare_ret = prepareTicketInstance(
        ticket_template, input.ticket_name, input.ticket_descr, input.ticket_input)
    if (!prepare_ret.ok) {
        output.result = "FAILED"
        output.result_name = "工单发起失败"
        output.message = prepare_ret.message
        return
    }
    output.result = "SUCCEEDED"
    output.result_name = "工单发起成功"
    output.message = "工单发起成功，请前往工单列表查看"
    output.ticket_info = {
        ticket_template: ticket_template,
        ticket_instance: prepare_ret.ticket_instance,
    }
}

try {
    mainProcessFunction();
} catch (e) {
    output.result = "FAILED"
    output.result_name = "工单发起失败"
    output.message = "操作异常，请稍后重试："+e.message
}
ctx.output(output);

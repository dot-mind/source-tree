// 1. 获取单个「脚本执行记录」详情
// 2. 执行脚本，获得结果
// 3. 将结果记录至「脚本执行记录」对象

// 输入规格：
// {
//     "task_record_id": "",
// }

// 输出规格：
// {
//     "result": "SUCCEEDED/FAILED",
//     "result_name": "执行成功",
//     "message": "message",
// }

var output = {
    "result": "",
    "result_name": "",
    "message": "",
};

var ctx = new WorkflowRuntimeContext();
var input = ctx.input();
var ecu = ctx.ecu;

var scriptTaskRecordSchema = "cmdb_schema_x-3cu4v1w20seby"
var scriptTaskIndex = "cmdb_index-2f84ou7p5ewhp"
var taskStatusIndex = "cmdb_index-3kyli9jj9w7ua"

var execStatusWaiting = "WAITING"
var execStatusRunning = "RUNNING"
var execStatusFinished = "FINISHED"
var execStatusSucceeded = "SUCCEEDED"
var execStatusFailed = "FAILED"
var execStatusCanceled = "CANCELED"

var maxOut = 3000000
var execTypeExportEnv = "shell-with-env-export"

// 返回值：
// {
//     "ok": true/false,
//     "message": "error message",
// }
function validateScriptTaskRecord(task_record) {
    return {ok: true}
}

// 返回值：
// {
//     "ok": true/false,
//     "message": "error message",
//     "task_exec_return": { /*ecu.TaskResult*/ },
// }
function executeScriptTaskRecord(task_record_id, task_record) {
    rand_task_id = ctx.utils.genId("task")
    exec_detail = task_record.snapshot
    system_server_id = exec_detail.server_info.system_server_id

    // 0. 记录开始时间并改变状态
    var now = new Date().getTime();
    taskRecordObject = {
        indexes: {
            "cmdb_index-3kyli9jj9w7ua": execStatusRunning,
            "cmdb_index-5nmjlz3wl24o": Math.ceil(now / 1000),
        },
    }
    taskRecordQuery = {
        objects: [task_record_id],
        conditions: [
            {field: ".inode.schema_id", op: "=", value: scriptTaskRecordSchema},
        ], limit: 1,
    }
    try {
        ecu.cmdb.updateObjects(taskRecordQuery, {
            object: taskRecordObject, updates: [
                ".indexes.cmdb_index-3kyli9jj9w7ua",
                ".indexes.cmdb_index-5nmjlz3wl24o",
            ],
        })
    } catch(e) {
        return {ok: false, message: "操作异常，请稍后重试："+e.message}
    }

    // 1. startServerTask
    server_task = {}
    try {
        server_task = ecu.server.startServerTask(system_server_id, {
            task_id: rand_task_id,
            user: exec_detail.exec_user,
            dir: exec_detail.work_dir,
            exec_type: exec_detail.exec_type || "shell",
            exec_body: exec_detail.script,
            timeout: exec_detail.exec_time_limit,
        })
    } catch (e) {
        return {ok: false, message: "执行初始化失败："+e.message}
    }

    // 2. waitServerTask
    task_return = {}
    try {
        task_return = ecu.server.waitServerTask(system_server_id, rand_task_id, exec_detail.exec_time_limit)
    } catch (e) {
        return {ok: false, message: "获取执行结果失败："+e.message}
    }
    var now2 = new Date().getTime()
    return {ok: true, task_exec_return: task_return, elapsed_time: (now2-now) / 1000}
}


function splitOut(out, max) {
    if (!out) {
        return out;
    }
    var len = out.length;
    return out.substring(len - max, len);
}

// 记录脚本执行的结果至「脚本执行记录」对象中
// 参数 @exec_detail：
// {
//     "server_info": {
//         "resource_id": "",
//         "system_server_id": "",
//         "private_addresses": [],
//         "public_addresses": [],
//     }
//     "script": "",
//     "exec_mode": "",
//     "exec_user": "",
//     "work_dir": "",
//     "exec_time_limit": 10,
//     "ssh_config": {
//         "ssh_password": "",
//         "ssh_key": "",
//     },
//     "output_format": ""
// }
// 参数 @exec_result：
// {
//     "ok": true/false,
//     "message": "error message",
//     "task_exec_return": { /*ecu.TaskResult*/ },
// }
// 返回值：
// {
//     "ok": true/false,
//     "message": "error message",
// }
function saveTaskExecResult(task_record_id, exec_detail, exec_result) {
    // 1. 判断任务执行的结果
    task_return = {
        exit_code: -1,
    }
    record_status = "SUCCEEDED"
    exec_descr = "脚本执行成功"
    if (!exec_result.ok) {
        record_status = "FAILED"
        exec_descr = exec_result.message
    } else {
        task_return = exec_result.task_exec_return
        switch(task_return.exit_by) {
            case "CANCEL-BEFORE-START":
                record_status = "FAILED"
                exec_descr = "脚本执行前被取消"
                break;
            case "CANCEL-DUR-RUNNING":
                record_status = "FAILED"
                exec_descr = "脚本执行中被取消"
                break;
            case "KILLED-BY-TIMEOUT":
                record_status = "FAILED"
                exec_descr = "脚本执行超时"
                break;
            case "QUIT-SELF":
            default:
                if (task_return.exit_code != 0) {
                    record_status = "FAILED"
                    exec_descr = "退出码非零："+task_return.exit_code
                }
        }
    }

    var hasSplit = (task_return.stdout && task_return.stdout.length >= maxOut)
    || (task_return.stderr && task_return.stderr.length >= maxOut)

    if (hasSplit) {
        task_return.stdout = splitOut(task_return.stdout, maxOut)
        task_return.stderr = splitOut(task_return.stderr, maxOut)
    }

    // 2. 按设置格式解析脚本的输出
    exec_output = {}
    if (record_status == "SUCCEEDED") {
        var hasEnv = exec_detail.snapshot.exec_type === execTypeExportEnv
        if (!hasSplit) {
            stdout = task_return.stdout.trim()
            switch (exec_detail.snapshot.output_format) {
                case "INI":
                    try {
                        output_schema = JSON.parse(exec_detail.snapshot.output_schema)
                        exec_output = ctx.utils.parseINIConfig(stdout, output_schema)
                    } catch (e) {}
                    break;
                case "JSON":
                    try { exec_output = JSON.parse(stdout) } catch (e) { }
                    break;
                case "XML":
                    break;
                case "NONE":
            }
        }
        // 改为合并方式
        if (hasEnv && task_return.env && task_return.env.length) {
            for (var i = 0; i < task_return.env.length; i++) {
                var env = task_return.env[i];
                var name = env[0] || "";
                if (name.substring(0, 10) === "OM_OUTPUT_") {
                    exec_output[name.substring(10)] = env[1];
                }
            }
        }
    }
    // 3. 将结果记录到「脚本执行记录」中
    taskRecordObject = {
        data: {
            exec_descr: exec_descr,
            output: exec_output,
            exit_code: task_return.exit_code,
            stdout: task_return.stdout,
            stderr: task_return.stderr,
            elapsed_time: exec_result.elapsed_time,
        },
        indexes: {
            "cmdb_index-3kyli9jj9w7ua": record_status
        },
    }
    taskRecordQuery = {
        objects: [task_record_id],
        conditions: [
            {field: ".inode.schema_id", op: "=", value: scriptTaskRecordSchema},
        ], limit: 1,
    }
    update_result = {}
    try {
        update_result = ecu.cmdb.updateObjects(taskRecordQuery, {
            object: taskRecordObject, updates: [
                ".data.exec_descr", ".data.output", ".data.exit_code",
                ".data.stdout", ".data.stderr", ".data.elapsed_time",
                ".indexes.cmdb_index-3kyli9jj9w7ua",
            ],
        }, { no_audit: true })
    } catch(e) {
        return {ok: false, message: "操作异常，请稍后重试："+e.message}
    }
    return {ok: true}
}

function mainProcessFunction() {
    var task_record = input.task_record;
    var task_record_id = task_record.id;
    validate_ret = validateScriptTaskRecord(task_record)
    if (!validate_ret.ok) {
        output.result = "FAILED"
        output.result_name = "执行失败"
        output.message = validate_ret.message
        return
    }
    var context = {
        snapshot: task_record
    }
    exec_ret = executeScriptTaskRecord(task_record_id, context)
    save_ret = saveTaskExecResult(task_record_id, context, exec_ret)
    if (!save_ret.ok) {
        output.result = "FAILED"
        output.result_name = "执行失败"
        output.message = save_ret.message
        return
    }
    output.result = "SUCCEEDED"
    output.result_name = "执行完成"
    output.message = "脚本执行完成"
}

function notifyTaskStatusChange(task_id) {
    if (!task_id) {
        return
    }
    try {
        ecu.kvdb.batchWriteKeyValue(
            "MCOP",
            [
                {
                    type: "TASK",
                    key: "status_update_notify",
                    id: task_id,
                    value: "{}",
                }
            ]
        );
    } catch(e) {}
}

try {
    mainProcessFunction();
    notifyTaskStatusChange(input.task_id);
} catch (e) {
    output.result = "FAILED"
    output.result_name = "执行失败"
    output.message = "操作异常，请稍后重试："+e.message
}
ctx.output(output);
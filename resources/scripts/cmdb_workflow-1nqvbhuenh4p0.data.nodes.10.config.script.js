// 将结果记录至「脚本执行记录」对象

// 输入规格：
// {
//     "task_record": {},
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

// 返回值：
// {
//     "ok": true/false,
//     "message": "error message",
// }
function validateScriptTaskRecord(task_record) {
    return {ok: true}
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
        task_return = exec_result.task_exec_return;
        if (task_return.exit_code !== 0) {
            record_status = "FAILED"
            exec_descr = task_return.exit_error;
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
    if (record_status == "SUCCEEDED" && !hasSplit) {
        output_schema = {}
        try {
            output_schema = JSON.parse(exec_detail.snapshot.output_schema)   
        } catch(e) {}
        stdout = task_return.stdout.trim()
        switch (exec_detail.snapshot.output_format) {
        case "INI":
            try {
                exec_output = ctx.utils.parseINIConfig(stdout, output_schema)
            } catch(e) {}
            break;
        case "JSON":
            try { exec_output = JSON.parse(stdout) } catch(e) {}
            break;
        case "XML":
            break;
        case "NONE":
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
            elapsed_time: (task_return.elapsed_time / 1000.0).toFixed(3),
        },
        indexes: {
            "cmdb_index-3kyli9jj9w7ua": record_status
        },
    }
    taskRecordQuery = {
        objects: [task_record_id],
        conditions: [
            {
                field: ".inode.schema_id",
                op: "=",
                value: scriptTaskRecordSchema,
            },
        ], limit: 1,
    }
    update_result = {}
    try {
        update_result = ecu.cmdb.updateObjects(taskRecordQuery, {
            object: taskRecordObject, updates: [
                ".data.exec_descr",
                ".data.output",
                ".data.exit_code",
                ".data.stdout",
                ".data.stderr",
                ".data.elapsed_time",
                ".indexes.cmdb_index-3kyli9jj9w7ua",
            ],
        }, { no_audit: true })
    } catch(e) {
        return {ok: false, message: "操作异常，请稍后重试："+e.message}
    }
    return {ok: true}
}

function mainProcessFunction() {
    var task_record = input.record
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
    var exec_ret = {
        ok: true,
        task_exec_return: input.output
    }
    if (input.error) {
        exec_ret.ok = false;
        exec_ret.message = input.error;
    }
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
} catch (e) {
    output.result = "FAILED"
    output.result_name = "执行失败"
    output.message = "操作异常，请稍后重试："+e.message
}
notifyTaskStatusChange(input.task_id);
ctx.output(output);
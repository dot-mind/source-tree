var ctx = new WorkflowRuntimeContext();
var input = ctx.input();
var ecu = ctx.ecu;
ctx.output({result: "SUCCEEDED",ticket_info:{global_vars:{}}})

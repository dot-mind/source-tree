async function render(props) {
  const {
    config: {
      resId,
      previewed
    },
    state,
    onChange,
    ecu,
    children,
  } = props;

  return (
    <OmSourceTree
      ecu={ecu}
      onChange={onChange}
      id={state.id}
      adminMode={state.adminMode}
      selectedKeys={state.selectedKeys}
    />
  );
}

async function getSchema(props) {
  const {
    schema,
    state,
    ecu,
  } = props;

  return schema;
}
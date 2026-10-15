// Red-brown asterisk after the label of a field that must be filled in.
const RequiredMark = () => (
  <span aria-hidden="true" title="Required" style={{ color: '#B4511E', fontWeight: 900, marginLeft: 2 }}>*</span>
);

export default RequiredMark;

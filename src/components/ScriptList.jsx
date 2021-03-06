import PropTypes from "prop-types";
import React from "react";
import gql from "graphql-tag";
import Form from "react-formal";

import FlatButton from "material-ui/FlatButton";
import { List, ListItem } from "material-ui/List";
import Subheader from "material-ui/Subheader";
import Divider from "material-ui/Divider";
import Dialog from "material-ui/Dialog";
import CreateIcon from "material-ui/svg-icons/content/create";

import { withOperations } from "../containers/hoc/with-operations";
import CannedResponseForm from "./CannedResponseForm";
import GSSubmitButton from "./forms/GSSubmitButton";

const styles = {
  dialog: {
    zIndex: 10001
  }
};

class ScriptList extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      script: props.script,
      dialogOpen: false
    };
  }

  handleOpenDialog = () => {
    this.setState({
      dialogOpen: true
    });
  };

  handleCloseDialog = () => {
    this.setState({
      dialogOpen: false,
      script: null
    });
  };

  render() {
    const {
      subheader,
      scripts,
      onSelectCannedResponse,
      showAddScriptButton,
      customFields,
      campaignId,
      mutations,
      texterId
    } = this.props;
    const { dialogOpen } = this.state;

    const onSaveCannedResponse = async cannedResponse => {
      try {
        const saveObject = {
          ...cannedResponse,
          campaignId,
          userId: texterId
        };
        await mutations.createCannedResponse(saveObject);
        this.setState({ dialogOpen: false });
      } catch (err) {
        console.error(err);
      }
    };

    // const rightIconButton = (
    //   <IconMenu
    //     iconButtonElement={<IconButton><MoreVertIcon /></IconButton>}
    //     anchorOrigin={{horizontal: 'left', vertical: 'bottom'}}
    //     targetOrigin={{horizontal: 'left', vertical: 'bottom'}}
    //   >
    //     <MenuItem primaryText={duplicateCampaignResponses && !script.isUserCreated ? "Duplicate and edit" : "Edit"}
    //       onTouchTap={() => this.handleEditScript(script)}
    //     />
    //     {
    //       script.isUserCreated ? (
    //         <MenuItem primaryText="Delete"
    //           onTouchTap={() => this.handleDeleteScript(script.id)}
    //         />
    //       ) : ''
    //     }
    //   </IconMenu>
    // )

    const rightIconButton = null;
    const listItems = scripts.map(script => (
      <ListItem
        value={script.text}
        onTouchTap={() => onSelectCannedResponse(script)}
        key={script.id}
        primaryText={script.title}
        secondaryText={script.text}
        rightIconButton={rightIconButton}
        secondaryTextLines={2}
      />
    ));

    const list =
      scripts.length === 0 ? null : (
        <List>
          <Subheader>{subheader}</Subheader>,{listItems}
          <Divider />
        </List>
      );

    return (
      <div>
        {list}
        {showAddScriptButton ? (
          <FlatButton
            label="Add new canned response"
            icon={<CreateIcon />}
            onTouchTap={this.handleOpenDialog}
          />
        ) : (
          ""
        )}
        <Form.Context>
          <Dialog
            style={styles.dialog}
            open={dialogOpen}
            actions={[
              <FlatButton label="Cancel" onTouchTap={this.handleCloseDialog} />,
              <Form.Button
                type="submit"
                component={GSSubmitButton}
                label="Save"
              />
            ]}
            onRequestClose={this.handleCloseDialog}
          >
            <CannedResponseForm
              onSaveCannedResponse={onSaveCannedResponse}
              customFields={customFields}
              script={this.state.script}
            />
          </Dialog>
        </Form.Context>
      </div>
    );
  }
}

ScriptList.propTypes = {
  script: PropTypes.object,
  scripts: PropTypes.arrayOf(PropTypes.object),
  subheader: PropTypes.element,
  onSelectCannedResponse: PropTypes.func,
  showAddScriptButton: PropTypes.bool,
  customFields: PropTypes.array,
  campaignId: PropTypes.string,
  mutations: PropTypes.object,
  texterId: PropTypes.string
};

const mutations = {
  createCannedResponse: ownProps => cannedResponse => ({
    mutation: gql`
      mutation createCannedResponse($cannedResponse: CannedResponseInput!) {
        createCannedResponse(cannedResponse: $cannedResponse) {
          id
        }
      }
    `,
    variables: { cannedResponse }
  })
};

export default withOperations({
  mutations
})(ScriptList);

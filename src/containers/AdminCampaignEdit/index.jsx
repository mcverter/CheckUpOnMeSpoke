import PropTypes from "prop-types";
import React from "react";
import { compose } from "react-apollo";
import gql from "graphql-tag";
import queryString from "query-string";
import isEqual from "lodash/isEqual";
import moment from "moment";

import Dialog from "material-ui/Dialog";
import FlatButton from "material-ui/FlatButton";

import { withAuthzContext } from "../../components/AuthzProvider";
import { loadData } from "../hoc/with-operations";

import CampaignEditHeader from "./components/CampaignEditHeader";
import SectionWrapper from "./components/SectionWrapper";
import CampaignBasicsForm from "./sections/CampaignBasicsForm";
import CampaignContactsForm from "./sections/CampaignContactsForm";
import CampaignTextersForm from "./sections/CampaignTextersForm";
import CampaignOverlapManager from "./sections/CampaignOverlapManager";
import CampaignInteractionStepsForm from "./sections/CampaignInteractionStepsForm";
import CampaignCannedResponsesForm from "./sections/CampaignCannedResponsesForm";
import CampaignTextingHoursForm from "./sections/CampaignTextingHoursForm";
import CampaignAutoassignModeForm from "./sections/CampaignAutoassignModeForm";
import CampaignTeamsForm from "./sections/CampaignTeamsForm";

const disableTexters = window.DISABLE_CAMPAIGN_EDIT_TEXTERS;

// TODO: replace with Fragment
const campaignInfoFragment = `
  id
  title
  description
  dueBy
  isStarted
  isArchived
  contactsCount
  datawarehouseAvailable
  customFields
  useDynamicAssignment
  logoImageUrl
  introHtml
  primaryColor
  textingHoursStart
  textingHoursEnd
  isAssignmentLimitedToTeams
  isAutoassignEnabled
  timezone
  teams {
    id
    title
  }
  ${
    disableTexters
      ? ""
      : `
  texters {
    id
    firstName
    lastName
    assignment(campaignId:$campaignId) {
      contactsCount
      needsMessageCount: contactsCount(contactsFilter:{messageStatus:\"needsMessage\"})
      maxContacts
    }
  }
  `
  }
  interactionSteps {
    id
    questionText
    scriptOptions
    answerOption
    answerActions
    parentInteractionId
    isDeleted
  }
  cannedResponses {
    id
    title
    text
  }
  editors
`;

class AdminCampaignEdit extends React.Component {
  constructor(props) {
    super(props);
    const isNew = queryString.parse(props.location.search).new;
    this.state = {
      expandedSection: isNew ? 0 : null,
      campaignFormValues: Object.assign({}, props.campaignData.campaign),
      isWorking: false,
      requestError: undefined
    };
  }

  componentWillReceiveProps(newProps) {
    // This should only update the campaignFormValues sections that
    // are NOT expanded so the form data doesn't compete with the user
    // The basic flow of data:
    // 1. User adds data to a section -> this.state.campaignFormValues
    // 2. User saves -> (handleSave) mutations.editCampaign ->
    // 3. Refetch/poll updates data in loadData component wrapper
    //    and triggers *this* method => this.props.campaignData => this.state.campaignFormValues
    // So campaignFormValues should always be the diffs between server and client form data
    let { expandedSection } = this.state;
    let expandedKeys = [];
    if (expandedSection !== null) {
      expandedSection = this.sections()[expandedSection];
      expandedKeys = expandedSection.keys;
    }

    const campaignDataCopy = {
      ...newProps.campaignData.campaign
    };
    expandedKeys.forEach(key => {
      // contactsCount is in two sections
      // That means it won't get updated if *either* is opened
      // but we want it to update in either
      if (key === "contactsCount") {
        return;
      }
      delete campaignDataCopy[key];
    });
    // NOTE: Since this does not _deep_ copy the values the
    // expandedKey pointers will remain the same object as before
    // so setState passes on those subsections should1 not refresh
    const pushToFormValues = {
      ...this.state.campaignFormValues,
      ...campaignDataCopy
    };
    // contacts and contactSql need to be *deleted*
    // when contacts are done on backend so that Contacts section
    // can be marked saved, but only when user is NOT editing Contacts
    if (campaignDataCopy.contactsCount > 0) {
      const specialCases = ["contacts", "contactSql"];
      specialCases.forEach(key => {
        if (expandedKeys.indexOf(key) === -1) {
          delete pushToFormValues[key];
        }
      });
    }

    this.setState({
      campaignFormValues: Object.assign({}, pushToFormValues)
    });
  }

  onExpandChange = (index, newExpandedState) => {
    const { expandedSection } = this.state;

    if (newExpandedState) {
      this.setState({ expandedSection: index });
    } else if (index === expandedSection) {
      this.setState({ expandedSection: null });
    }
  };

  getSectionState(section) {
    const sectionState = {};
    section.keys.forEach(key => {
      sectionState[key] = this.state.campaignFormValues[key];
    });
    return sectionState;
  }

  isNew() {
    return queryString.parse(this.props.location.search).new;
  }

  async handleDeleteJob(jobId) {
    if (
      confirm(
        "Discarding the job will not necessarily stop it from running." +
          " However, if the job failed, discarding will let you try again." +
          " Are you sure you want to discard the job?"
      )
    ) {
      await this.props.mutations.deleteJob(jobId);
      await this.props.pendingJobsData.refetch();
    }
  }

  handleChange = formValues => {
    this.setState({
      campaignFormValues: {
        ...this.state.campaignFormValues,
        ...formValues
      }
    });
  };

  handleSubmit = async () => {
    await this.handleSave();
    this.setState({
      expandedSection:
        this.state.expandedSection >= this.sections().length - 1 ||
        !this.isNew()
          ? null
          : this.state.expandedSection + 1
    }); // currently throws an unmounted component error in the console
    this.props.campaignData.refetch();
  };

  handleSave = async () => {
    // only save the current expanded section
    const { expandedSection } = this.state;
    if (expandedSection === null) {
      return;
    }

    const section = this.sections()[expandedSection];
    let newCampaign = {};
    if (this.checkSectionSaved(section)) {
      return; // already saved and no data changes
    }

    newCampaign = {
      ...this.getSectionState(section)
    };

    if (Object.keys(newCampaign).length > 0) {
      // Transform the campaign into an input understood by the server
      delete newCampaign.customFields;
      delete newCampaign.contactsCount;
      if (newCampaign.hasOwnProperty("contacts") && newCampaign.contacts) {
        const contactData = newCampaign.contacts.map(contact => {
          const customFields = {};
          const contactInput = {
            cell: contact.cell,
            firstName: contact.firstName,
            lastName: contact.lastName,
            zip: contact.zip || "",
            external_id: contact.external_id || ""
          };
          Object.keys(contact).forEach(key => {
            if (!contactInput.hasOwnProperty(key)) {
              customFields[key] = contact[key].trim();
            }
          });
          contactInput.customFields = JSON.stringify(customFields);
          return contactInput;
        });
        newCampaign.contacts = contactData;
        newCampaign.texters = [];
      } else {
        newCampaign.contacts = null;
      }
      if (newCampaign.hasOwnProperty("teams")) {
        newCampaign.teamIds = newCampaign.teams.map(team => team.id);
        delete newCampaign.teams;
      }
      if (newCampaign.hasOwnProperty("texters")) {
        newCampaign.texters = newCampaign.texters.map(texter => ({
          id: texter.id,
          needsMessageCount: texter.assignment.needsMessageCount,
          maxContacts: texter.assignment.maxContacts,
          contactsCount: texter.assignment.contactsCount
        }));
      }
      if (newCampaign.hasOwnProperty("interactionSteps")) {
        newCampaign.interactionSteps = Object.assign(
          {},
          newCampaign.interactionSteps
        );
      }

      this.setState({ isWorking: true });
      try {
        const response = await this.props.mutations.editCampaign(
          this.props.campaignData.campaign.id,
          newCampaign
        );
        if (response.errors) throw new Error(response.errors);
      } catch (err) {
        const isJsonError = err.message.includes(
          "Unexpected token < in JSON at position 0"
        );
        const errorMessage = isJsonError
          ? "There was an error with your request. This is likely due to uploading a contact list that is too large."
          : err.message;
        this.setState({ requestError: errorMessage });
      } finally {
        this.setState({ isWorking: false });
      }

      this.pollDuringActiveJobs();
    }
  };

  async pollDuringActiveJobs(noMore) {
    const pendingJobs = await this.props.pendingJobsData.refetch();
    if (pendingJobs.length && !noMore) {
      const self = this;
      setTimeout(() => {
        // run it once more after there are no more jobs
        self.pollDuringActiveJobs(true);
      }, 1000);
    }
    this.props.campaignData.refetch();
  }

  checkSectionSaved(section) {
    // Tests section's keys of campaignFormValues against props.campaignData
    // * Determines greyness of section button
    // * Determine if section is marked done (in green) along with checkSectionCompleted()
    // * Must be false for a section to save!!
    // Only Contacts section implements checkSaved()
    if (section.hasOwnProperty("checkSaved")) {
      return section.checkSaved();
    }
    const sectionState = {};
    const sectionProps = {};
    section.keys.forEach(key => {
      sectionState[key] = this.state.campaignFormValues[key];
      sectionProps[key] = this.props.campaignData.campaign[key];
    });
    if (JSON.stringify(sectionState) !== JSON.stringify(sectionProps)) {
      return false;
    }
    return true;
  }

  checkSectionCompleted(section) {
    return section.checkCompleted();
  }

  sections() {
    const sections = [
      {
        title: "Basics",
        content: CampaignBasicsForm,
        keys: [
          "title",
          "description",
          "dueBy",
          "logoImageUrl",
          "primaryColor",
          "introHtml"
        ],
        blocksStarting: true,
        expandAfterCampaignStarts: true,
        expandableBySuperVolunteers: true,
        checkCompleted: () =>
          this.state.campaignFormValues.title !== "" &&
          this.state.campaignFormValues.description !== "" &&
          this.state.campaignFormValues.dueBy !== null
      },
      {
        title: "Texting Hours",
        content: CampaignTextingHoursForm,
        keys: ["textingHoursStart", "textingHoursEnd", "timezone"],
        checkCompleted: () => true,
        blocksStarting: false,
        expandAfterCampaignStarts: true,
        expandableBySuperVolunteers: false
      },
      {
        title: "Contacts",
        content: CampaignContactsForm,
        keys: [
          "contacts",
          "contactsCount",
          "customFields",
          "contactSql",
          "excludeCampaignIds",
          "filterOutLandlines"
        ],
        checkCompleted: () => this.state.campaignFormValues.contactsCount > 0,
        checkSaved: () =>
          // Must be false for save to be tried
          // Must be true for green bar, etc.
          // This is a little awkward because neither of these fields are 'updated'
          //   from the campaignData query, so we must delete them after save/update
          //   at the right moment (see componentWillReceiveProps)
          this.state.campaignFormValues.contactsCount > 0 &&
          this.state.campaignFormValues.hasOwnProperty("contacts") === false &&
          this.state.campaignFormValues.hasOwnProperty("contactSql") === false,
        blocksStarting: true,
        expandAfterCampaignStarts: false,
        expandableBySuperVolunteers: false,
        extraProps: {
          optOuts: [], // this.props.organizationData.organization.optOuts, // <= doesn't scale
          datawarehouseAvailable: this.props.campaignData.campaign
            .datawarehouseAvailable,
          jobResultMessage:
            (
              this.props.pendingJobsData.campaign.pendingJobs.filter(job =>
                /contacts/.test(job.jobType)
              )[0] || {}
            ).resultMessage || "",
          canFilterLandlines:
            this.props.organizationData.organization &&
            !!this.props.organizationData.organization.numbersApiKey,
          otherCampaigns: this.props.organizationData.organization.campaigns.campaigns.filter(
            campaign => campaign.id != this.props.match.params.campaignId
          )
        }
      },
      {
        title: "Contact Overlap Management",
        content: CampaignOverlapManager,
        keys: [],
        blockStarting: false,
        expandAfterCampaignStarts: true,
        expandableBySuperVolunteers: false,
        checkCompleted: () => true
      },
      {
        title: "Teams",
        content: CampaignTeamsForm,
        keys: ["teams", "isAssignmentLimitedToTeams"],
        checkSaved: () => {
          const {
            isAssignmentLimitedToTeams: newIsAssignmentLimitedToTeams,
            teams: newTeams
          } = this.state.campaignFormValues;
          const {
            isAssignmentLimitedToTeams,
            teams
          } = this.props.campaignData.campaign;
          const sameIsAssignmentLimitedToTeams =
            newIsAssignmentLimitedToTeams === isAssignmentLimitedToTeams;
          const sameTeams = isEqual(
            new Set(newTeams.map(team => team.id)),
            new Set(teams.map(team => team.id))
          );
          return sameIsAssignmentLimitedToTeams && sameTeams;
        },
        checkCompleted: () => true,
        blocksStarting: false,
        expandAfterCampaignStarts: true,
        expandableBySuperVolunteers: false,
        extraProps: {
          orgTeams: this.props.organizationData.organization.teams
        }
      },
      {
        title: "Texters",
        content: CampaignTextersForm,
        keys: ["texters", "contactsCount", "useDynamicAssignment"],
        checkCompleted: () =>
          (this.state.campaignFormValues.texters.length > 0 &&
            this.state.campaignFormValues.contactsCount ===
              this.state.campaignFormValues.texters.reduce(
                (left, right) => left + right.assignment.contactsCount,
                0
              )) ||
          this.state.campaignFormValues.useDynamicAssignment === true,
        blocksStarting: false,
        expandAfterCampaignStarts: true,
        expandableBySuperVolunteers: true,
        extraProps: {
          isOverdue: moment().isSameOrAfter(
            this.props.campaignData.campaign.dueBy
          ),
          orgTexters: this.props.organizationData.organization.texters,
          organizationUuid: this.props.organizationData.organization.uuid,
          campaignId: this.props.campaignData.campaign.id
        }
      },
      {
        title: "Interactions",
        content: CampaignInteractionStepsForm,
        keys: ["interactionSteps"],
        checkCompleted: () =>
          this.state.campaignFormValues.interactionSteps.length > 0,
        blocksStarting: true,
        expandAfterCampaignStarts: true,
        expandableBySuperVolunteers: true,
        extraProps: {
          customFields: this.props.campaignData.campaign.customFields,
          availableActions: this.props.availableActionsData.availableActions
        }
      },
      {
        title: "Canned Responses",
        content: CampaignCannedResponsesForm,
        keys: ["cannedResponses"],
        checkCompleted: () => true,
        blocksStarting: true,
        expandAfterCampaignStarts: true,
        expandableBySuperVolunteers: true,
        extraProps: {
          customFields: this.props.campaignData.campaign.customFields
        }
      },
      {
        title: "Autoassign Mode",
        content: CampaignAutoassignModeForm,
        keys: ["isAutoassignEnabled"],
        checkCompleted: () => true,
        blocksStarting: true,
        expandAfterCampaignStarts: true,
        expandableBySuperVolunteers: false
      }
    ];

    return disableTexters
      ? sections.filter(section => section.title !== "Texters")
      : sections;
  }

  sectionSaveStatus(section) {
    const pendingJobs = this.props.pendingJobsData.campaign.pendingJobs;
    let sectionIsSaving = false;
    let relatedJob = null;
    let savePercent = 0;
    let jobMessage = null;
    let jobId = null;
    if (pendingJobs.length > 0) {
      if (section.title === "Contacts") {
        relatedJob = pendingJobs.filter(
          job =>
            job.jobType === "upload_contacts" || job.jobType === "contact_sql"
        )[0];
      } else if (section.title === "Texters") {
        relatedJob = pendingJobs.filter(
          job => job.jobType === "assign_texters"
        )[0];
      } else if (section.title === "Interactions") {
        relatedJob = pendingJobs.filter(
          job => job.jobType === "create_interaction_steps"
        )[0];
      }
    }

    if (relatedJob) {
      sectionIsSaving = !relatedJob.resultMessage;
      savePercent = relatedJob.status;
      jobMessage = relatedJob.resultMessage;
      jobId = relatedJob.id;
    }
    return {
      sectionIsSaving,
      savePercent,
      jobMessage,
      jobId
    };
  }

  renderCampaignFormSection(section, forceDisable) {
    const { isWorking } = this.state;
    const shouldDisable =
      isWorking ||
      (forceDisable || (!this.isNew() && this.checkSectionSaved(section)));
    const saveLabel = isWorking
      ? "Working..."
      : this.isNew()
        ? "Save and goto next section"
        : "Save";
    const ContentComponent = section.content;
    const formValues = this.getSectionState(section);
    return (
      <ContentComponent
        onChange={this.handleChange}
        formValues={formValues}
        saveLabel={saveLabel}
        saveDisabled={shouldDisable}
        ensureComplete={this.props.campaignData.campaign.isStarted}
        onSubmit={this.handleSubmit}
        campaignId={this.props.match.params.campaignId}
        organizationId={this.props.match.params.organizationId}
        {...section.extraProps}
      />
    );
  }

  handleCloseError = () => this.setState({ requestError: undefined });

  isCampaignComplete = () => {
    const sections = this.sections();
    const { pendingJobs } = this.props.pendingJobsData.campaign;

    const isJobErrored = job => /Error/.test(job.resultMessage || "");
    const erroredJobs = pendingJobs.filter(isJobErrored);
    let isCompleted = erroredJobs.length === 0;

    sections.forEach(section => {
      const isIncomplete =
        section.blocksStarting && !this.checkSectionCompleted(section);
      const isSaved = this.checkSectionSaved(section);
      if (isIncomplete || !isSaved) {
        isCompleted = false;
      }
    });

    return isCompleted;
  };

  render() {
    const sections = this.sections();
    const { expandedSection, requestError } = this.state;
    const { adminPerms, match, campaignData } = this.props;
    const { campaignId } = match.params;
    const { isStarted } = campaignData.campaign;

    const errorActions = [
      <FlatButton label="Ok" primary={true} onClick={this.handleCloseError} />
    ];

    return (
      <div>
        <CampaignEditHeader
          campaignId={campaignId}
          isCampaignComplete={this.isCampaignComplete()}
        />
        {sections.map((section, sectionIndex) => {
          const { expandableBySuperVolunteers } = section;
          const {
            sectionIsSaving,
            savePercent,
            jobMessage,
            jobId
          } = this.sectionSaveStatus(section);
          const sectionIsDone =
            this.checkSectionCompleted(section) &&
            this.checkSectionSaved(section);
          const sectionIsExpanded = sectionIndex === expandedSection;

          const hasPermissions = adminPerms || expandableBySuperVolunteers;
          const canExpand = section.expandAfterCampaignStarts || !isStarted;
          const sectionCanExpandOrCollapse = canExpand && hasPermissions;

          const handleDiscardJob = () => this.handleDeleteJob(jobId);
          const handleExpandChange = expanded =>
            this.onExpandChange(sectionIndex, expanded);

          return (
            <SectionWrapper
              key={section.title}
              title={section.title}
              sectionCanExpandOrCollapse={sectionCanExpandOrCollapse}
              sectionIsExpanded={sectionIsExpanded}
              sectionIsSaving={sectionIsSaving}
              sectionIsDone={sectionIsDone}
              savePercent={savePercent}
              canDiscardJob={sectionIsSaving && adminPerms}
              jobMessage={jobMessage}
              onDiscardJob={handleDiscardJob}
              onExpandChange={handleExpandChange}
            >
              {this.renderCampaignFormSection(section, sectionIsSaving)}
            </SectionWrapper>
          );
        })}
        <Dialog
          title="Request Error"
          actions={errorActions}
          open={requestError !== undefined}
          onRequestClose={this.handleCloseError}
        >
          {requestError || ""}
        </Dialog>
      </div>
    );
  }
}

AdminCampaignEdit.propTypes = {
  campaignData: PropTypes.object,
  mutations: PropTypes.object,
  organizationData: PropTypes.object,
  match: PropTypes.object.isRequired,
  adminPerms: PropTypes.bool.isRequired,
  location: PropTypes.object,
  pendingJobsData: PropTypes.object,
  availableActionsData: PropTypes.object
};

const queries = {
  pendingJobsData: {
    query: gql`
      query getCampaignJobs($campaignId: String!) {
        campaign(id: $campaignId) {
          id
          pendingJobs {
            id
            jobType
            assigned
            status
            resultMessage
          }
        }
      }
    `,
    options: ownProps => ({
      variables: {
        campaignId: ownProps.match.params.campaignId
      },
      fetchPolicy: "cache-and-network",
      pollInterval: 60000
    })
  },
  campaignData: {
    query: gql`query getCampaign($campaignId: String!) {
      campaign(id: $campaignId) {
        ${campaignInfoFragment}
      }
    }`,
    options: ownProps => ({
      variables: {
        campaignId: ownProps.match.params.campaignId
      },
      fetchPolicy: "cache-and-network",
      pollInterval: 60000
    })
  },
  organizationData: {
    query: gql`
      query getOrganizationData($organizationId: String!) {
        organization(id: $organizationId) {
          id
          uuid
          teams {
            id
            title
          }
          ${
            disableTexters
              ? ""
              : `
          texters: people {
            id
            firstName
            lastName
            displayName
          }
          `
          }
          numbersApiKey
          campaigns(cursor: { offset: 0, limit: 5000 }) {
            campaigns {
              id
              title
              createdAt
            }
          }
        }
      }
    `,
    options: ownProps => ({
      variables: {
        organizationId: ownProps.match.params.organizationId
      },
      pollInterval: 20000
    })
  },
  availableActionsData: {
    query: gql`
      query getActions($organizationId: String!) {
        availableActions(organizationId: $organizationId) {
          name
          display_name
          instructions
        }
      }
    `,
    options: ownProps => ({
      variables: {
        organizationId: ownProps.match.params.organizationId
      },
      fetchPolicy: "network-only"
    })
  }
};

// Right now we are copying the result fields instead of using a fragment because of https://github.com/apollostack/apollo-client/issues/451
const mutations = {
  editCampaign: ownProps => (campaignId, campaign) => ({
    mutation: gql`
      mutation editCampaign($campaignId: String!, $campaign: CampaignInput!) {
        editCampaign(id: $campaignId, campaign: $campaign) {
          ${campaignInfoFragment}
        }
      },
    `,
    variables: {
      campaignId,
      campaign
    }
  }),
  deleteJob: ownProps => jobId => ({
    mutation: gql`
      mutation deleteJob($campaignId: String!, $id: String!) {
        deleteJob(campaignId: $campaignId, id: $id) {
          id
        }
      }
    `,
    variables: {
      campaignId: ownProps.match.params.campaignId,
      id: jobId
    }
  })
};

export default compose(
  withAuthzContext,
  loadData({
    queries,
    mutations
  })
)(AdminCampaignEdit);
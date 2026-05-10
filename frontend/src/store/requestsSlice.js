import { createSlice } from "@reduxjs/toolkit";

const requestsSlice = createSlice({
  name: "requests",
  initialState: {
    // Form state
    form: {
      patientName: "",
      phone: "",
      email: "",
      sendVia: "SMS", // "SMS" | "Email" | "Both"
    },
    // Recent requests list
    recentRequests: [
      {
        id: 1,
        name: "James Owens",
        contact: "+1 (555) 201-3344",
        via: "SMS",
        status: "Sent",
        sentAt: "2 hours ago",
      },
      {
        id: 2,
        name: "Priya Nair",
        contact: "priya@email.com",
        via: "Email",
        status: "Opened",
        sentAt: "5 hours ago",
      },
      {
        id: 3,
        name: "David Okafor",
        contact: "+1 (555) 988-1120",
        via: "Both",
        status: "Reviewed",
        sentAt: "1 day ago",
      },
      {
        id: 4,
        name: "Angela Torres",
        contact: "angela@email.com",
        via: "Email",
        status: "Sent",
        sentAt: "2 days ago",
      },
    ],
    loading: false,
    error: null,
    successMsg: "",
  },
  reducers: {
    // Update a single form field
    updateFormField(state, action) {
      const { field, value } = action.payload;
      state.form[field] = value;
      state.error = null;
      state.successMsg = "";
    },

    // Reset form back to empty
    resetForm(state) {
      state.form = { patientName: "", phone: "", email: "", sendVia: "SMS" };
    },

    // Called when sending request starts
    sendRequestStart(state) {
      state.loading = true;
      state.error = null;
      state.successMsg = "";
    },

    // Called when request sent successfully
    sendRequestSuccess(state, action) {
      state.loading = false;
      state.successMsg = action.payload.message;
      // Add to top of recent requests list
      state.recentRequests.unshift({
        id: Date.now(),
        name: action.payload.name,
        contact: action.payload.contact,
        via: action.payload.via,
        status: "Sent",
        sentAt: "Just now",
      });
      // Reset form after success
      state.form = { patientName: "", phone: "", email: "", sendVia: "SMS" };
    },

    // Called when sending fails
    sendRequestFailure(state, action) {
      state.loading = false;
      state.error = action.payload;
    },

    // Clear success message
    clearSuccessMsg(state) {
      state.successMsg = "";
    },
  },
});

export const {
  updateFormField,
  resetForm,
  sendRequestStart,
  sendRequestSuccess,
  sendRequestFailure,
  clearSuccessMsg,
} = requestsSlice.actions;

export default requestsSlice.reducer;

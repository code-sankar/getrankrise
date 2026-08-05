// frontend/src/api/membersAPI.js
//
// Team management. Every mutation here is owner-only server-side
// (restrictTo("owner") in member.routes.js); the UI hides the controls from
// staff as a courtesy, but the server is what enforces it — so a staff member
// who reaches these calls another way gets a 403 with a message, not access.

import axiosInstance from "../utils/axios.helper.js";

export const membersAPI = {
  /**
   * Members AND pending invitations in one call — they are one list in the UI
   * ("who has access?"), and two requests would let the screen render a
   * half-truth while the second is in flight.
   *
   * Also returns `yourRole` and `canInvite`, so the component never has to
   * re-derive the permission rule the server already applied.
   */
  list: async () => {
    const { data } = await axiosInstance.get("/clinic/members");
    return data?.data ?? { members: [], invitations: [] };
  },

  invite: async ({ email, role }) => {
    const { data } = await axiosInstance.post("/clinic/members/invite", {
      email,
      role,
    });
    return data;
  },

  revokeInvitation: async (id) => {
    const { data } = await axiosInstance.delete(
      `/clinic/members/invitations/${id}`,
    );
    return data;
  },

  updateRole: async (userId, role) => {
    const { data } = await axiosInstance.patch(`/clinic/members/${userId}`, {
      role,
    });
    return data;
  },

  remove: async (userId) => {
    const { data } = await axiosInstance.delete(`/clinic/members/${userId}`);
    return data;
  },
};

export default membersAPI;

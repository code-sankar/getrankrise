import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import Button from "../Button";
import { changeUserPassword } from "../../hooks/user.hook.js";

function ChangePassword() {
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      currentPassword: "",
      newPassword:     "",
      confirmPassword: "",
    },
  });

  const newPassword = watch("newPassword");

  const onSubmit = async (data) => {
    if (data.newPassword !== data.confirmPassword) {
      toast.error("New password and confirmation do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await changeUserPassword(data.currentPassword, data.newPassword);
      reset();
    } catch (err) {
      // changeUserPassword already toasted the error
      console.error("Change password failed:", err?.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-wrap justify-center gap-y-4 py-4">
      <div className="w-full sm:w-1/2 lg:w-1/3">
        <h5 className="font-semibold">Password</h5>
        <p className="text-gray-300">Update your password</p>
      </div>
      <div className="w-full sm:w-1/2 lg:w-2/3">
        <form onSubmit={handleSubmit(onSubmit)} className="rounded-lg border">
          <div className="w-full px-4 py-2">
            <label htmlFor="current-pwd" className="mb-1 inline-block">
              Current password
            </label>
            <input
              type="password"
              id="current-pwd"
              autoComplete="current-password"
              className="w-full px-2 py-1.5 border rounded-lg bg-transparent"
              placeholder="Enter your current password"
              {...register("currentPassword", { required: "Current password is required" })}
            />
            {errors.currentPassword && (
              <p className="text-red-400 text-xs mt-1">{errors.currentPassword.message}</p>
            )}
          </div>

          <div className="w-full px-4 py-2">
            <label htmlFor="new-pwd" className="mb-1 inline-block">
              New password
            </label>
            <input
              type="password"
              id="new-pwd"
              autoComplete="new-password"
              className="w-full px-2 py-1.5 border rounded-lg bg-transparent"
              placeholder="At least 8 characters"
              {...register("newPassword", {
                required: "New password is required",
                minLength: { value: 8, message: "Password must be at least 8 characters" },
              })}
            />
            {errors.newPassword && (
              <p className="text-red-400 text-xs mt-1">{errors.newPassword.message}</p>
            )}
          </div>

          <div className="w-full px-4 py-2">
            <label htmlFor="conf-pwd" className="mb-1 inline-block">
              Confirm new password
            </label>
            <input
              type="password"
              id="conf-pwd"
              autoComplete="new-password"
              className="w-full px-2 py-1.5 border rounded-lg bg-transparent"
              placeholder="Re-enter your new password"
              {...register("confirmPassword", {
                required: "Please confirm your new password",
                validate: (v) => v === newPassword || "Passwords do not match",
              })}
            />
            {errors.confirmPassword && (
              <p className="text-red-400 text-xs mt-1">{errors.confirmPassword.message}</p>
            )}
          </div>

          <div className="w-full px-4 py-3 flex justify-end">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Updating..." : "Update password"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ChangePassword;
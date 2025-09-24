import status from "http-status";
import config from "../../config";
import prisma from "../../utils/prisma";
import ApiError from "../../errors/AppError";
import { RefreshPayload } from "./auth.interface";
import { sendEmail } from "../../utils/sendEmail";
import { jwtHelpers } from "./../../helpers/jwtHelpers";
import { passwordCompare } from "../../helpers/comparePasswords";
import { hashPassword } from "../../helpers/hashPassword";

const loginUser = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new ApiError(status.NOT_FOUND, "User not found!");
  }

  const isPasswordMatched = await passwordCompare(password, user.password);

  if (!isPasswordMatched) {
    throw new ApiError(status.UNAUTHORIZED, "Password is incorrect!");
  }

  const jwtPayload = {
    id: user?.id,
    name: user?.name,
    email: user?.email,
    role: user?.role,
    profilePic: user?.profilePic,
  };

  const accessToken = jwtHelpers.createToken(
    jwtPayload,
    config.jwt.access.secret as string,
    config.jwt.access.expiresIn as string
  );

  const refreshToken = jwtHelpers.createToken(
    jwtPayload,
    config.jwt.refresh.secret as string,
    config.jwt.refresh.expiresIn as string
  );

  return {
    accessToken,
    refreshToken,
  };
};

const verifyEmail = async (token: string) => {
  const verifiedToken = jwtHelpers.verifyToken(
    token,
    config.jwt.access.secret as string
  );

  const user = await prisma.user.findUnique({
    where: { email: verifiedToken.email },
  });

  if (!user) {
    throw new ApiError(status.NOT_FOUND, "User not found!");
  }

  // if (user.isVerified) {
  //   throw new ApiError(status.BAD_REQUEST, "User already verified!");
  // }

  // await prisma.user.update({
  //   where: {
  //     email: verifiedToken.email,
  //   },
  //   data: {
  //     isVerified: true,
  //   },
  // });

  return null;
};

const verifyResetPassLink = async (token: string) => {
  const verifiedToken = jwtHelpers.verifyToken(
    token,
    config.jwt.access.secret as string
  );

  const user = await prisma.user.findUnique({
    where: { email: verifiedToken.email },
  });

  if (!user) {
    throw new ApiError(status.NOT_FOUND, "User not found!");
  }

  // await prisma.user.update({
  //   where: { email: verifiedToken.email },
  //   data: {
  //     isResetPassword: false,
  //     canResetPassword: true,
  //   },
  // });

  return null;
};

const changePassword = async (
  email: string,
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
) => {
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new ApiError(status.NOT_FOUND, "User not found!");
  }

  if (!newPassword) {
    throw new ApiError(status.BAD_REQUEST, "New password is required!");
  }

  if (!confirmPassword) {
    throw new ApiError(status.BAD_REQUEST, "Confirm password is required!");
  }

  if (newPassword !== confirmPassword) {
    throw new ApiError(
      status.BAD_REQUEST,
      "New password and confirm password do not match!"
    );
  }

  const isPasswordMatch = await passwordCompare(currentPassword, user.password);

  if (!isPasswordMatch) {
    throw new ApiError(status.UNAUTHORIZED, "Current password is incorrect!");
  }

  const hashedNewPassword = await hashPassword(newPassword);

  await prisma.user.update({
    where: { email },
    data: {
      password: hashedNewPassword,
      passwordChangedAt: new Date(),
    },
  });

  return null;
};

const forgotPassword = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    throw new ApiError(status.NOT_FOUND, "User not found!");
  }

  console.log(user);

  const jwtPayload = {
    id: user.id,
    name: user.name,
    email: user.email,
    profilePic: user.profilePic,
    role: user.role,
    // isVerified: user.isVerified,
  };

  const accessToken = jwtHelpers.createToken(
    jwtPayload,
    config.jwt.refresh.secret as string,
    config.jwt.refresh.expiresIn as string
  );

  const resetPassLink = `${config.verify.resetPassUI}?token=${accessToken}`;
  await sendEmail(user.email, resetPassLink);

  // Step 4: Return response
  return {
    message:
      "We have sent a Reset Password link to your email address. Please check your inbox.",
  };
};

const resetPassword = async (
  token: string,
  newPassword: string,
  confirmPassword: string
) => {
  if (newPassword !== confirmPassword) {
    throw new ApiError(status.BAD_REQUEST, "Passwords do not match!");
  }

  const verifiedToken = jwtHelpers.verifyToken(
    token,
    config.jwt.refresh.secret as string
  );

  // Step 2: Find user from decoded payload
  const user = await prisma.user.findUnique({
    where: { email: verifiedToken?.email },
  });

  if (!user) {
    throw new ApiError(status.NOT_FOUND, "User not found!");
  }

  console.log(user)
  // Step 3: Hash new password
  const hashedPassword = await hashPassword(newPassword);

  // Step 4: Update password
  const result = await prisma.user.update({
    where: { email: verifiedToken?.email },
    data: {
      password: hashedPassword,
    },
  });

  console.log(result)

  const { password, ...others } = result;
  return others;
};

const resendVerificationLink = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    throw new ApiError(status.NOT_FOUND, "User not found!");
  }

  // if (user.isVerified) {
  //   throw new ApiError(status.BAD_REQUEST, "User account already verified!");
  // }

  const jwtPayload = {
    id: user.id,
    name: user.name,
    email: user.email,
    profilePic: user.profilePic,
    role: user.role,
    // isVerified: user.isVerified,
  };

  const accessToken = jwtHelpers.createToken(
    jwtPayload,
    config.jwt.access.secret as string,
    config.jwt.access.expiresIn as string
  );

  const confirmedLink = `${config.verify.email}?token=${accessToken}`;

  await sendEmail(user.email, undefined, confirmedLink);

  return {
    message:
      "New verification link has been sent to your email. Please check your inbox.",
  };
};

const resendResetPassLink = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    throw new ApiError(status.NOT_FOUND, "User not found!");
  }

  const jwtPayload = {
    id: user.id,
    name: user.name,
    email: user.email,
    profilePic: user.profilePic,
    role: user.role,
    // isVerified: user.isVerified,
  };

  // await prisma.user.update({
  //   where: { email: user.email },
  //   data: {
  //     isResetPassword: true,
  //   },
  // });

  const accessToken = jwtHelpers.createToken(
    jwtPayload,
    config.jwt.access.secret as string,
    config.jwt.access.expiresIn as string
  );

  const resetPassLink = `${config.verify.resetPassLink}?token=${accessToken}`;

  await sendEmail(user.email, resetPassLink);

  return {
    message:
      "New Reset Password link has been sent to your email. Please check your inbox.",
  };
};

const getMe = async (email: string) => {
  const result = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      profilePic: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      passwordChangedAt: true,
    },
  });

  return result;
};

export const refreshToken = async (token: string) => {
  const decoded = jwtHelpers.verifyToken(
    token,
    config.jwt.refresh.secret as string
  ) as RefreshPayload;

  const { email, iat } = decoded;

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      profilePic: true,
      // isVerified: true,
      passwordChangedAt: true,
    },
  });

  if (!user) {
    throw new ApiError(status.NOT_FOUND, "User not found");
  }

  /* Reject if password changed after token was issued */
  if (
    user.passwordChangedAt &&
    /* convert both to seconds since epoch */
    Math.floor(user.passwordChangedAt.getTime() / 1000) > iat
  ) {
    throw new ApiError(
      status.UNAUTHORIZED,
      "Password was changed after this token was issued"
    );
  }

  const jwtPayload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    profilePic: user?.profilePic,
    // isVerified: user.isVerified,
  };

  const accessToken = jwtHelpers.createToken(
    jwtPayload,
    config.jwt.refresh.secret as string,
    config.jwt.refresh.expiresIn as string
  );

  return { accessToken };
};

export const AuthService = {
  getMe,
  loginUser,
  verifyEmail,
  refreshToken,
  resetPassword,
  changePassword,
  forgotPassword,
  verifyResetPassLink,
  resendResetPassLink,
  resendVerificationLink,
};

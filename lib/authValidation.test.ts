import { signInSchema, signUpSchema } from "./authValidation";

describe("Auth Validation", () => {
    describe("signInSchema", () => {
        it("validates correct email and password", () => {
            const valid = { email: "test@example.com", password: "password123" };
            expect(signInSchema.parse(valid)).toEqual(valid);
        });

        it("fails on invalid email", () => {
            const invalid = { email: "not-an-email", password: "password123" };
            expect(() => signInSchema.parse(invalid)).toThrow();
        });

        it("fails on short password", () => {
            const invalid = { email: "test@example.com", password: "123" };
            expect(() => signInSchema.parse(invalid)).toThrow();
        });
    });

    describe("signUpSchema", () => {
        it("validates correct payloads", () => {
            const valid = {
                email: "new@example.com",
                password: "strongpassword",
                username: "cooluser",
            };
            expect(signUpSchema.parse(valid)).toEqual(valid);
        });

        it("fails when username is too short", () => {
            const invalid = {
                email: "new@example.com",
                password: "strongpassword",
                username: "no",
            };
            expect(() => signUpSchema.parse(invalid)).toThrow();
        });
    });
});

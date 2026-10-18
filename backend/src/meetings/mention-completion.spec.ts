import { mentionRecordId } from "./mention-completion";

it("uses the standard UUIDv5 occurrence context shared with the browser", () => {
  expect(mentionRecordId("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333", 7))
    .toBe("8b5663cd-cb3e-5c7f-8c94-6936046241cd");
});

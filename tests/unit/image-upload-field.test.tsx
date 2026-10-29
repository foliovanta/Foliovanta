import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/portfolios-client", () => ({
  initiateMediaUpload: vi.fn(),
  completeMediaUpload: vi.fn(),
  attachMedia: vi.fn(),
}));

import { ImageUploadField } from "@/app/editor/[portfolioId]/[section]/image-upload-field";
import { attachMedia, completeMediaUpload, initiateMediaUpload } from "@/lib/api/portfolios-client";

const initiateMock = vi.mocked(initiateMediaUpload);
const completeMock = vi.mocked(completeMediaUpload);
const attachMock = vi.mocked(attachMedia);

const PID = "11111111-1111-1111-1111-111111111111";
const AID = "22222222-2222-2222-2222-222222222222";

const okInitiate = () =>
  initiateMock.mockResolvedValue({
    ok: true,
    data: {
      assetId: AID,
      upload: { url: "https://signed", method: "PUT", headers: {}, expiresInSeconds: 120 },
    },
  });
const okComplete = () =>
  completeMock.mockResolvedValue({
    ok: true,
    data: { status: "READY", width: 400, height: 300, contentType: "image/png" },
  });

// Fake signed-URL PUT: reports progress and resolves.
const fakePut = vi.fn(async (_auth, _file, onProgress: (p: number) => void) => {
  onProgress(100);
});

function pngFile(name = "a.png", size = 2048) {
  const file = new File([new Uint8Array(8)], name, { type: "image/png" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function renderField(overrides: Partial<React.ComponentProps<typeof ImageUploadField>> = {}) {
  const onAttached = vi.fn();
  const onConflict = vi.fn();
  render(
    <ImageUploadField
      label="Profile photo"
      shape="circle"
      purpose="PROFILE_AVATAR"
      portfolioId={PID}
      target={{ kind: "avatar" }}
      currentAssetId={null}
      getRevision={() => "5"}
      onAttached={onAttached}
      onConflict={onConflict}
      putImpl={fakePut as never}
      {...overrides}
    />,
  );
  return { onAttached, onConflict };
}

describe("ImageUploadField", () => {
  beforeEach(() => {
    initiateMock.mockReset();
    completeMock.mockReset();
    attachMock.mockReset();
    fakePut.mockClear();
  });

  it("runs the full flow and attaches with the current revision", async () => {
    const user = userEvent.setup();
    okInitiate();
    okComplete();
    attachMock.mockResolvedValue({ ok: true, data: { assetId: AID, revision: "6" } });
    const { onAttached } = renderField();

    await user.upload(screen.getByLabelText("Upload profile photo"), pngFile());

    await waitFor(() => expect(onAttached).toHaveBeenCalledWith("6", AID));
    expect(initiateMock).toHaveBeenCalledWith(PID, {
      purpose: "PROFILE_AVATAR",
      contentType: "image/png",
      byteSize: 2048,
    });
    expect(attachMock).toHaveBeenCalledWith(PID, {
      expectedRevision: "5",
      target: { kind: "avatar" },
      assetId: AID,
    });
  });

  it("rejects an oversized file client-side without calling the server", async () => {
    const user = userEvent.setup();
    renderField();
    // 50 MB PNG — valid type (passes the input's accept filter) but over the cap.
    await user.upload(
      screen.getByLabelText("Upload profile photo"),
      pngFile("big.png", 50 * 1024 * 1024),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/under 10 MB/);
    expect(initiateMock).not.toHaveBeenCalled();
  });

  it("surfaces a verification failure and does not attach", async () => {
    const user = userEvent.setup();
    okInitiate();
    completeMock.mockResolvedValue({
      ok: false,
      error: { status: 422, code: "VERIFICATION_FAILED", message: "bad" },
    });
    const { onAttached } = renderField();
    await user.upload(screen.getByLabelText("Upload profile photo"), pngFile());
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't be processed/);
    expect(attachMock).not.toHaveBeenCalled();
    expect(onAttached).not.toHaveBeenCalled();
  });

  it("handles a revision conflict without overwriting", async () => {
    const user = userEvent.setup();
    okInitiate();
    okComplete();
    attachMock.mockResolvedValue({
      ok: false,
      error: { status: 409, code: "REVISION_CONFLICT", message: "conflict" },
    });
    const { onAttached, onConflict } = renderField();
    await user.upload(screen.getByLabelText("Upload profile photo"), pngFile());
    await waitFor(() => expect(onConflict).toHaveBeenCalled());
    expect(screen.getByRole("alert")).toHaveTextContent(/changed somewhere else/);
    expect(onAttached).not.toHaveBeenCalled();
  });

  it("removes an attached image via a null attach", async () => {
    const user = userEvent.setup();
    attachMock.mockResolvedValue({ ok: true, data: { assetId: null, revision: "7" } });
    const { onAttached } = renderField({ currentAssetId: AID });
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(onAttached).toHaveBeenCalledWith("7", null));
    expect(attachMock).toHaveBeenCalledWith(PID, {
      expectedRevision: "5",
      target: { kind: "avatar" },
      assetId: null,
    });
  });

  it("attaches a cover to the exact project it belongs to", async () => {
    const user = userEvent.setup();
    okInitiate();
    okComplete();
    attachMock.mockResolvedValue({ ok: true, data: { assetId: AID, revision: "6" } });
    renderField({
      label: "Cover",
      shape: "rect",
      purpose: "PROJECT_COVER",
      target: { kind: "project", projectId: "P-123" },
    });
    await user.upload(screen.getByLabelText("Upload cover"), pngFile());
    await waitFor(() =>
      expect(attachMock).toHaveBeenCalledWith(PID, {
        expectedRevision: "5",
        target: { kind: "project", projectId: "P-123" },
        assetId: AID,
      }),
    );
  });
});

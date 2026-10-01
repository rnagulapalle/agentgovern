interface ForwardableEmailMessage {
  readonly to: string;
  forward(destination: string, headers?: Headers): Promise<unknown>;
  setReject(reason: string): void;
}

const RAJ = "raj.jsp@gmail.com";
const PRATIBHA = "pratibha.er@gmail.com";

const emailRouter = {
  async email(message: ForwardableEmailMessage): Promise<void> {
    const localPart = message.to.toLowerCase().split("@")[0];
    const headers = new Headers({
      "X-LoopLabs-Original-Recipient": message.to,
      "X-LoopLabs-Route": localPart,
    });

    if (localPart === "raj") {
      await message.forward(RAJ, headers);
      return;
    }
    if (localPart === "pratibha") {
      await message.forward(PRATIBHA, headers);
      return;
    }
    if (localPart === "founders" || localPart === "hello") {
      await Promise.all([
        message.forward(RAJ, headers),
        message.forward(PRATIBHA, headers),
      ]);
      return;
    }

    message.setReject("Unknown LoopLabs recipient");
  },
};

export default emailRouter;

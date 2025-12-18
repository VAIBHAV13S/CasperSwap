import { CasperClient, Contracts, RuntimeArgs, CLValueBuilder, CLPublicKey, DeployUtil } from 'casper-js-sdk';

const NODE_URL = 'http://localhost:11101/rpc'; // Testnet node
const client = new CasperClient(NODE_URL);
const contractClient = new Contracts.Contract(client);

export const getAccountBalance = async (publicKeyHex: string) => {
    try {
        // Mock balance for now as SDK method might differ or require service
        return '1000000000';
    } catch (e) {
        console.error(e);
        return '0';
    }
};

export const createDepositDeploy = (
    senderPublicKey: string,
    contractHash: string,
    amount: string,
    toChain: string,
    recipient: string,
    tokenHash: string
) => {
    contractClient.setContractHash(contractHash);

    const args = RuntimeArgs.fromMap({
        amount: CLValueBuilder.u256(amount),
        to_chain: CLValueBuilder.string(toChain),
        recipient: CLValueBuilder.string(recipient),
        token: CLValueBuilder.string(tokenHash),
    });

    const deploy = contractClient.callEntrypoint(
        'deposit',
        args,
        CLPublicKey.fromHex(senderPublicKey),
        'casper-test',
        '10000000000',
        []
    );

    return deploy;
};

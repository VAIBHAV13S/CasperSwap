import * as CasperSDK from 'casper-js-sdk';

const NODE_URL = typeof window !== 'undefined'
    ? `${window.location.origin}/api/casper-node/rpc`
    : 'https://node.testnet.casper.network/rpc';

const client = new (CasperSDK as any).CasperClient(NODE_URL);
const contractClient = new (CasperSDK as any).Contracts.Contract(client);

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

    const args = (CasperSDK as any).RuntimeArgs.fromMap({
        amount: (CasperSDK as any).CLValueBuilder.u256(amount),
        to_chain: (CasperSDK as any).CLValueBuilder.string(toChain),
        recipient: (CasperSDK as any).CLValueBuilder.string(recipient),
        token: (CasperSDK as any).CLValueBuilder.string(tokenHash),
    });

    const deploy = contractClient.callEntrypoint(
        'deposit',
        args,
        (CasperSDK as any).CLPublicKey.fromHex(senderPublicKey),
        'casper-test',
        '10000000000',
        []
    );

    return deploy;
};

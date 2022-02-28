import { SampleToken } from '@/SampleToken';
import colors from 'colors';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import {
    AccountMap,
    AccountNames,
    AccountState as BaseAccountState,
    BaseTestContext
} from '../helpers/BaseTestContext';
import { txExec } from '../helpers/utils';



export type AccountState = BaseAccountState & {
    nfts : BigNumber[],
};

type Token = {
    name : string,
    features : BigNumber,
    createdAt : BigNumber,
}


export class TestContext
    extends BaseTestContext
{
    
    public nftToken : SampleToken;
    
    public accountsState : AccountMap<AccountState> = {};
    
    public tokens : Token[] = [];
    
    
    public async initAccounts ()
    {
        await super.initAccounts();
        
        for (const name of AccountNames) {
            this.accountsState[name].nfts = [];
        }
    }
    
    public async initNftTokenContract (
        name : string = 'SToken',
        symbol : string = 'STK',
        baseURL : string = 'https://example.com/',
        maxSupply : number = 1000,
    )
    {
        this.nftToken = await this.deployContract(
            'SampleToken',
            name,
            symbol,
            baseURL,
            maxSupply
        );
        
        return this.nftToken;
    }
    
    public async createTokens (amount : number)
    {
        await this.executeInSingleBlock(async() => {
            for (let i = 0; i < amount; ++i) {
                const token : Token = {
                    name: `Token #${i}`,
                    features: BigNumber.from(i),
                    createdAt: BigNumber.from(0),
                };

                this.tokens.push(token);
            
                await this.nftToken
                    .connect(this.ownerAccount)
                    .mint(
                        this.ownerAccount.address,
                        token
                    );
            }
        });
    }
    
    public async sendTokens (amount : number)
    {
        let tid = 0;
        for (const accountName of [ 'alice', 'bob', 'carol', 'dave', 'eva' ]) {
            const account = this.accounts[accountName];
            const accountState : AccountState = this.accountsState[accountName];
            
            for (let i = 0; i < amount; ++i) {
                const tokenId = BigNumber.from(tid++);
                
                const [ tx, result ] = await txExec(
                    this.nftToken
                        .connect(this.ownerAccount)
                        ['safeTransferFrom(address,address,uint256)'](
                        this.ownerAccount.address,
                        account.address,
                        tokenId
                    )
                );
                
                accountState.nfts.push(tokenId);
            }
        }
    }
    
}

import { MintedEvent, SampleToken, TokenStruct, TransferEvent } from '@/SampleToken';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import colors from 'colors';
import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';
import {
    AccountMap,
    AccountNames,
    AccountState as BaseAccountState,
    BaseTestContext,
    TokenMap
} from '../helpers/BaseTestContext';
import { findEvent, txExec } from '../helpers/utils';



export type AccountState = BaseAccountState & {
    nfts: BigNumber[],
};


export class TestContext
    extends BaseTestContext
{
    
    public nftToken : SampleToken;
    
    public accountsState : AccountMap<AccountState> = {};
    
    
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
    
    public async createTokens(amount : number)
    {
        await this.executeInSingleBlock(async() => {
            for (let i = 0; i < amount; ++i) {
                await this.nftToken
                    .connect(this.ownerAccount)
                    .mint(
                        this.ownerAccount.address,
                        {
                            name: `Token #${i}`,
                            features: i,
                            createdAt: 0,
                        }
                    )
            }
        });
    }
    
    public async sendTokens(amount : number)
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
    
    public async displayDetails (label : string = 'details')
    {
        const block = await ethers.provider.getBlock('latest');
        
        console.log(
            colors.red('### ' + label),
        );
        
        console.log();
    }
}

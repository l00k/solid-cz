import { Mintable } from '@/Mintable';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers } from 'hardhat';
import { Factory } from './fixtures/contracts';


const contractsToTest = [
    'SampleCoin'
];

contractsToTest.forEach(contractName => {
    
    describe(`SampleCoin`, () => {
        let owner : SignerWithAddress;
        let alice : SignerWithAddress;
        let bob : SignerWithAddress;
        let contract : Mintable;
        
        beforeEach(async() => {
            [ owner, alice, bob ] = await ethers.getSigners();
            contract = <any> await Factory[contractName]();
        });
    });
    
});

